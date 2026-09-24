"""판정 입력과 환산 가정을 해시로 식별하는 계약 근거 조각을 만든다."""

import hashlib
import json
from collections.abc import Mapping, Sequence
from functools import lru_cache
from typing import Any

import yaml

from crowdcast.paths import REPO_ROOT


# 판정과 근거가 같은 설정의 규칙 식별자·조항·문구를 사용한다.
@lru_cache(maxsize=1)
def rule_settings() -> dict[str, Any]:
    settings = yaml.safe_load((REPO_ROOT / "configs/thresholds.yaml").read_text(encoding="utf-8"))
    checklist = yaml.safe_load((REPO_ROOT / "configs/checklist.yaml").read_text(encoding="utf-8"))
    settings["rules"].update(checklist["rules"])
    return settings


# 정본 그래프에 없는 식별자로 근거가 발행되는 것을 막는다.
@lru_cache(maxsize=1)
def _master_ids() -> dict[str, Any]:
    path = REPO_ROOT / "packages/contracts/jsonld/master-ids.json"
    return json.loads(path.read_text(encoding="utf-8"))


# 입력 순서에 영향을 받지 않는 JSON으로 해시를 계산하고 비유한 수는 거부한다.
def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


# 사용하지 않는 계약 필드는 명시적인 null로 채우고 전체 내용과 입력을 함께 식별한다.
def _evidence(
    kind: str,
    title: str,
    summary: str,
    inputs: Mapping[str, Any],
    quantity_ids: Sequence[str],
    forecast_id: str | None,
    **references: str | None,
) -> dict[str, Any]:
    evidence = {
        "kind": kind,
        "title": title,
        "summary": summary,
        "quantityIds": sorted(set(quantity_ids)),
        "period": None,
        "source": None,
        "availableAt": None,
        "ruleId": None,
        "clauseId": None,
        "caseEventId": None,
        "assumptionId": None,
        "forecastId": forecast_id,
        "modelVersion": None,
        "checkResult": None,
        **references,
    }
    digest = hashlib.sha256(
        _canonical_json({"evidence": evidence, "inputs": dict(inputs)}).encode()
    ).hexdigest()
    return {"id": f"ev-{digest}", **evidence}


# 법정·자체 구분, 법정 조항과 실제 판정 입력을 규칙 근거에 남긴다.
def rule_evidence(
    rule_id: str,
    inputs: Mapping[str, Any],
    *,
    text: str | None = None,
    quantity_ids: Sequence[str] = (),
    forecast_id: str | None = None,
) -> dict[str, Any]:
    if rule_id not in _master_ids()["rules"]:
        raise ValueError(f"기준 그래프에 없는 규칙입니다: {rule_id}")
    rule = rule_settings()["rules"][rule_id]
    clause_id = rule["clause_id"]
    if rule["kind"] == "법정" and clause_id not in _master_ids()["clauses"]:
        raise ValueError(f"법정 규칙에 등록된 조항이 필요합니다: {rule_id}")
    if rule["kind"] == "자체" and clause_id is not None:
        raise ValueError(f"자체 규칙에 법정 조항을 붙일 수 없습니다: {rule_id}")

    # 고정 사유 문구와 별도로 입력 필드·수치를 직렬화해 계산 근거를 보존한다.
    summary = f"{rule['kind']} 기준 — {text or rule['text']} 입력: {_canonical_json(dict(inputs))}"
    return _evidence(
        "rule",
        rule["title"],
        summary,
        inputs,
        quantity_ids,
        forecast_id,
        ruleId=rule_id,
        clauseId=clause_id,
    )


# 적용한 값·범위·단위·가정 출처를 빠짐없이 환산 근거에 기록한다.
def assumption_evidence(
    assumption: Mapping[str, Any],
    *,
    inputs: Mapping[str, Any] | None = None,
    quantity_ids: Sequence[str] = (),
    forecast_id: str | None = None,
) -> dict[str, Any]:
    if assumption["id"] not in _master_ids()["assumptions"]:
        raise ValueError(f"기준 그래프에 없는 가정입니다: {assumption['id']}")
    if not 0 <= assumption["low"] <= assumption["value"] <= assumption["high"]:
        raise ValueError("가정의 값은 음수가 아닌 범위 안에 있어야 합니다.")
    summary = (
        f"{assumption['name']}: {assumption['value']} {assumption['unit']} "
        f"(범위 {assumption['low']}~{assumption['high']}, {assumption['basis']}). "
        f"{assumption['note']} 추정 산식 기반"
    )
    return _evidence(
        "assumption",
        assumption["name"],
        summary,
        {"assumption": dict(assumption), "inputs": dict(inputs or {})},
        quantity_ids,
        forecast_id,
        assumptionId=assumption["id"],
    )
