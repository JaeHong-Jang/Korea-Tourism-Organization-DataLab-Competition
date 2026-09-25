"""계약 원장 본문과 감사 메타를 고정하고 명시한 등록일에만 records로 전송한다."""

import json
from collections.abc import Callable
from datetime import datetime
from hashlib import sha256
from typing import Any

import httpx
from crowdcast import paths
from crowdcast.api.assemble.artifacts import Unavailable
from crowdcast.api.assemble.identity import canonical
from crowdcast.api.contract import validate
from crowdcast.data.call_ledger import atomic_write, file_lock
from crowdcast.scoring import rules
from crowdcast.scoring.select import Batch, load_selection

RECORDS_URL = "http://127.0.0.1:8030"
ZERO_HASH = "0" * 64
PAYLOAD_KEYS = ("forecastId", "eventId", "leadDays", "forecast")


# 서버가 생성할 필드를 검사값으로 채워 중첩 forecast까지 정본 계약으로 검증한다.
def validate_payload(payload: dict[str, Any]) -> None:
    validate("ledger-entry", {
        **payload, "seq": 1, "registeredAt": f"{rules.REGISTRATION_DATE}T00:00:00+09:00",
        "payloadHash": ZERO_HASH, "prevHash": ZERO_HASH, "hash": ZERO_HASH,
    })
    values = [payload["forecast"][f"dailyMeanP{q}"] for q in (10, 50, 90)]
    if any(type(value) is not int or value < 0 for value in values) or values != sorted(values):
        raise ValueError("원장 인원은 비음수 정수이며 p10 ≤ p50 ≤ p90이어야 합니다")


# 원장 서버의 UTF-8 정렬 JSON·해시 체인을 로컬에서도 검증한다.
def verify_ledger(entries: list[dict[str, Any]]) -> None:
    previous = ZERO_HASH
    seen = set()
    for seq, entry in enumerate(entries, 1):
        validate("ledger-entry", entry)
        validate_payload({key: entry[key] for key in PAYLOAD_KEYS})
        payload = {key: entry[key] for key in ("seq", "registeredAt", *PAYLOAD_KEYS)}
        digest = sha256(canonical(payload).encode()).hexdigest()
        if (entry["seq"] != seq or entry["prevHash"] != previous or entry["payloadHash"] != digest
                or entry["hash"] != sha256((previous + digest).encode()).hexdigest()
                or entry["forecastId"] in seen):
            raise ValueError("원장 해시 체인·연속 순번·중복 예보 검증 실패")
        seen.add(entry["forecastId"])
        previous = entry["hash"]


# 수치와 순서는 저장된 예보에서만 가져오고 실행 시각을 준비본에 넣지 않는다.
def prepare(batch: Batch, selection: dict[str, Any]) -> dict[str, Any]:
    payloads = []
    for summary in selection["summaries"]:
        forecast = batch.forecasts[summary["forecastId"]]
        payload = {
            "forecastId": forecast["id"], "eventId": forecast["eventId"],
            "leadDays": (rules.local_date(summary["startsAt"]) - rules.REGISTRATION_DATE).days,
            "forecast": {**{f"dailyMeanP{q}": forecast["dailyMean"][f"p{q}"] for q in (10, 50, 90)},
                         "level": forecast["judgment"]["level"]},
        }
        validate_payload(payload)
        payloads.append(payload)
    document = rules.render_rules(batch.metadata, selection["audit"])
    return {
        "metadata": {**batch.metadata, "registrationDate": str(rules.REGISTRATION_DATE),
                     "tag": rules.TAG, "rulesDoc": rules.RULES_DOC,
                     "rulesSha256": sha256(document.encode()).hexdigest()},
        "selection": selection["audit"], "summaries": selection["summaries"],
        "events": selection["events"], "payloads": payloads,
    }


# 등록 준비 파일만 원자적으로 기록하고 다른 입력으로 기존 준비본을 덮어쓰지 않는다.
def save_preparation(preparation: dict[str, Any]) -> None:
    output = paths.PROCESSED / "prereg_payloads.json"
    content = (canonical(preparation) + "\n").encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with file_lock(output.with_suffix(".lock")):
        if output.exists() and output.read_bytes() != content:
            raise ValueError("기존 등록 준비본과 입력이 다릅니다 — 오케스트레이터의 보관·재준비 필요")
        if not output.exists():
            atomic_write(output, content)


# 공개할 선정 집합과 입력 해시는 저장된 준비본에서 만든다.
def public_metadata(preparation: dict[str, Any], raw: bytes) -> dict[str, Any]:
    metadata = preparation["metadata"]
    payloads = preparation["payloads"]
    return {
        "preparationSha256": sha256(raw).hexdigest(),
        **{key: metadata[key] for key in (
            "registrationDate", "forecastsSha256", "runId", "modelVersion", "verdict")},
        "eventIds": [row["eventId"] for row in payloads],
        "forecastIds": [row["forecastId"] for row in payloads],
    }


# 공개 메타에 고정한 전체 바이트를 대조해 행사·설정 중 어느 부분의 변경도 거부한다.
def load_preparation() -> dict[str, Any]:
    raw = (paths.PROCESSED / "prereg_payloads.json").read_bytes()
    public = rules.public_meta_path()
    if not public.exists():
        raise ValueError("공개 메타가 없습니다 — 등록 완료 뒤에만 채점할 수 있습니다")
    metadata = json.loads(public.read_bytes())
    if metadata.get("preparationSha256") != sha256(raw).hexdigest():
        raise ValueError("등록 준비본과 공개 메타의 SHA-256 불일치")
    preparation = json.loads(raw)
    if metadata != public_metadata(preparation, raw):
        raise ValueError("등록 준비본과 공개 메타의 선정 집합·모델 정보 불일치")
    return preparation


# 테스트 시계도 매번 호출해 배치 도중 한국 날짜가 바뀌는 경우를 재현한다.
def require_registration_date(clock: Callable[[], datetime] | None = None) -> None:
    instant = clock() if clock is not None else datetime.now(rules.KST)
    if rules.local_date(instant) != rules.REGISTRATION_DATE:
        raise ValueError("--send는 KST 2026-09-29에만 허용됩니다 — 남은 POST 중단")


# 중단 뒤 재시도할 때 확인된 등록과 미전송·응답 미확인을 혼동하지 않게 남긴다.
def save_progress(preparation: dict[str, Any], registered: set[str],
                  uncertain: str | None, reason: str | None) -> None:
    identifiers = [row["forecastId"] for row in preparation["payloads"]]
    progress = {
        "registeredForecastIds": [key for key in identifiers if key in registered],
        "pendingForecastIds": [key for key in identifiers if key not in registered and key != uncertain],
        "uncertainForecastIds": [uncertain] if uncertain else [], "reason": reason,
    }
    atomic_write(paths.PROCESSED / "prereg_send_status.json", (canonical(progress) + "\n").encode())


# 서버 오류·비정상 JSON은 빈 원장으로 바꾸지 않는다.
def read_ledger(client: httpx.Client) -> list[dict[str, Any]]:
    try:
        response = client.get("/v1/ledger")
        response.raise_for_status()
        entries = response.json()
    except httpx.HTTPError:
        raise Unavailable("records 원장 조회 실패") from None
    if not isinstance(entries, list):
        raise ValueError("원장 응답은 항목 배열이어야 합니다")
    verify_ledger(entries)
    return entries


# 전송 여부와 관계없이 준비본을 먼저 고정하며 dry-run은 클라이언트도 만들지 않는다.
def register(*, send: bool = False, client: httpx.Client | None = None,
             clock: Callable[[], datetime] | None = None) -> dict[str, Any]:
    if send:
        require_registration_date(clock)
    batch, selection = load_selection()
    preparation = prepare(batch, selection)
    save_preparation(preparation)
    if send:
        document = paths.REPO_ROOT / rules.RULES_DOC
        if (not document.exists()
                or sha256(document.read_bytes()).hexdigest() != preparation["metadata"]["rulesSha256"]):
            raise ValueError("공개 RULES.md가 현재 준비본과 다릅니다 — 공개 규칙 확인 필요")
        raw = (paths.PROCESSED / "prereg_payloads.json").read_bytes()
        if raw != (canonical(preparation) + "\n").encode():
            raise ValueError("전송 전 등록 준비본이 변경되었습니다")
        public = rules.public_meta_path()
        content = (canonical(public_metadata(preparation, raw)) + "\n").encode()
        if public.exists() and public.read_bytes() != content:
            raise ValueError("기존 공개 메타와 다릅니다 — 등록 중단")
        if client is None:
            with httpx.Client(base_url=RECORDS_URL, timeout=15) as records:
                send_preparation(preparation, records, clock=clock)
        else:
            send_preparation(preparation, client, clock=clock)
        if not public.exists():
            atomic_write(public, content)
    return preparation


# 이미 같은 예보가 있으면 건너뛰고 내용 충돌은 쓰기 전에 거부한다.
def send_preparation(preparation: dict[str, Any], client: httpx.Client,
                     *, clock: Callable[[], datetime] | None = None) -> None:
    entries = read_ledger(client)
    existing = {entry["forecastId"]: entry for entry in entries}
    if set(existing) - {row["forecastId"] for row in preparation["payloads"]}:
        raise ValueError("원장에 선정 집합 밖의 forecastId가 있습니다")
    for payload in preparation["payloads"]:
        if previous := existing.get(payload["forecastId"]):
            if ({key: previous[key] for key in PAYLOAD_KEYS} != payload
                    or rules.local_date(previous["registeredAt"]) != rules.REGISTRATION_DATE):
                raise ValueError("이미 등록된 예보의 본문·등록일이 다릅니다")
    # 매 전송 직전 날짜를 새로 읽고 실패 시 마지막으로 확인한 진행 상황을 보존한다.
    registered = set(existing)
    save_progress(preparation, registered, None, None)
    for payload in preparation["payloads"]:
        if payload["forecastId"] in existing:
            continue
        uncertain = None
        try:
            require_registration_date(clock)
            uncertain = payload["forecastId"]
            response = client.post("/v1/ledger", json=payload)
            response.raise_for_status()
            entry = response.json()
            verify_ledger([*entries, entry])
            if ({key: entry[key] for key in PAYLOAD_KEYS} != payload
                    or rules.local_date(entry["registeredAt"]) != rules.REGISTRATION_DATE):
                raise ValueError("records 등록 응답과 준비본 불일치")
            entries.append(entry)
            registered.add(payload["forecastId"])
        except Exception as error:
            reason = "records 등록 응답 확인 필요" if isinstance(error, httpx.HTTPError) else str(error)
            save_progress(preparation, registered, uncertain, reason)
            if isinstance(error, httpx.HTTPError):
                raise Unavailable("records 등록 실패 — 원장 조회 뒤 같은 준비본으로 재실행하세요") from None
            raise
        save_progress(preparation, registered, None, None)
