"""사전 등록 상수와 모델 고지에서 공개 규칙 문서를 결정적으로 생성한다."""

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from crowdcast import paths
from crowdcast.api.assemble.identity import canonical
from crowdcast.data.crosswalk import INCHEON_BREAK_CODES
from crowdcast.rules import evidence, peak

REGISTRATION_DATE = date(2026, 9, 29)
KST = ZoneInfo("Asia/Seoul")
MIN_LEAD_DAYS = 3
LAST_END = date(2026, 10, 31)
MAX_DURATION = 14
MIN_BASELINE_DAYS = 3
BASELINE_WINDOW = 28
LEVELS = (1, 2, 3, 4)
PER_LEVEL = 8
MIN_TOTAL = 20
TAG = "prereg-2026-09-29"
RULES_DOC = "reports/preregistered/RULES.md"
PUBLIC_META = f"reports/preregistered/{REGISTRATION_DATE}-meta.json"
UNPROVEN_DATE = "TourAPI 일정 아님 → 문체부 파일 기준(공개일 미입증)"
PROMISE = (
    '사전 등록은 "지금 모델로 낸 예보를 먼저 공개하고 나중에 채점한다"는 약속이지, '
    "모델이 검증됐다는 뜻이 아니다."
)


# 테스트의 임시 reports 경로와 실제 공개 경로가 같은 상대 경로 규칙을 쓴다.
def public_meta_path() -> Path:
    return paths.REPORTS / PUBLIC_META.removeprefix("reports/")


# 시각의 날짜 부분을 자르지 않고 한국 날짜로 비교한다.
def local_date(value: str | date) -> date:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        return value
    elif len(value) == 10:
        return date.fromisoformat(value)
    else:
        parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("공개 시각에는 시간대가 필요합니다")
    return parsed.astimezone(KST).date()


# 채점 때 설정이 바뀌면 조용히 다른 환산을 적용하지 않도록 내용을 고정한다.
def conversion_settings() -> dict[str, Any]:
    return {"peak": peak._profiles(), "judgment": evidence.rule_settings()}


# 후보 포인터가 아닌 사용 모델의 같은 버전 고지·백테스트·환산 설정을 읽는다.
def model_metadata() -> dict[str, Any]:
    pointer = json.loads((paths.REPORTS / "backtest/promoted.json").read_bytes())
    version, run_id = pointer["modelVersion"], pointer["runId"]
    if Path(version).name != version or Path(run_id).name != run_id:
        raise ValueError("모델·실행 식별자 경로 오류")
    folder = paths.MODELS / version
    g0 = json.loads((folder / "g0.json").read_bytes())
    run = json.loads((folder / "run.json").read_bytes())
    backtest = json.loads((paths.REPORTS / "backtest" / run_id / "backtest.json").read_bytes())
    if g0["model_version"] != version or backtest["modelVersion"] != version:
        raise ValueError("사용 모델·G0·백테스트 버전 불일치")
    return {
        "modelVersion": version, "verdict": pointer["verdict"], "backtestRunId": run_id,
        "g0": {key: g0[key] for key in ("primary_model", "basis")},
        "backtest": {key: backtest["disclosure"][key] for key in ("evaluated", "covered")},
        "conversion": {"seed": run["config"]["seed"], "samples": run["config"]["samples"],
                       "settings": conversion_settings()},
        "promise": PROMISE,
    }


# 공개 규칙은 이 문자열 한 곳에서 만들고 문서·테스트·등록 준비본이 공유한다.
def rules_text() -> str:
    return f"""# 사전 등록 공개 규칙

등록일: {REGISTRATION_DATE.isoformat()} (KST). 공개 태그 예정: `{TAG}`.
참고용 — 담당자 검토 필수. 순간 최대·환산 판정은 추정 산식 기반.

## 선정
1. T-205 요약·예보는 runId, 행 수, forecastId 집합과 행사·모델·등급이 같아야 한다.
   제외 조건 적용 전 모든 예보에 대해 현재 행사 마스터의 계약 스냅샷으로
   identifier("f", {{eventId, asOf, modelVersion, event}})를 다시 계산해 JSONL forecast.id와 대조한다.
   asOf·modelVersion은 JSONL 값을 사용하며 위험 요소·시간대를 포함한 전체 행사 조건을 검증한다.
   하나라도 다르면 선정·등록을 거부한다: “T-205 뒤 행사 마스터가 바뀜 — 일괄 예보를 다시 돌리세요”.
2. 시작일 ≥ 등록일 + {MIN_LEAD_DAYS}일, 종료일 ≤ {LAST_END.isoformat()}.
3. 시군구 확정, 연속성 단절 없음. 인천 제외 코드: {', '.join(sorted(INCHEON_BREAK_CODES))}.
4. date_available_at이 있으면 KST 날짜 ≤ 등록일. 없으면 “{UNPROVEN_DATE}”로 기록한다.
5. 기간 1~{MAX_DURATION}일. T-205에 고정된 공개 평시 기간(최대 {BASELINE_WINDOW}일)에서
   행사에 필요한 요일마다 공휴일을 뺀 완전한 세 방문자 구분의 표본 ≥ {MIN_BASELINE_DAYS}일.
   등록일까지 공개된 자료만 사용한다. 이 검사는 채점 자료 확보 가능성 확인이다.
   실제 행사 직전 기준선은 API 지연 때문에 등록 시점에 없을 수 있으며 채점 때 다시 계산한다.
6. 등록 시 확인된 취소·연기 0건(선정 입력에 취소 정보 없음) — 이후 확인된 취소·연기는 채점에서 제외하고 공개.
   선정에는 취소 필터를 적용하지 않는다. 조건별 제외는 첫 사유 하나로 센다.
7. 등급 {', '.join(map(str, LEVELS))} 순서로 sha256(eventId + "{REGISTRATION_DATE}")의
   소문자 16진 해시 오름차순(동점은 eventId)으로 등급당 최대 {PER_LEVEL}건을 우선 선정한다.
   총 {MIN_TOTAL}건 미만이면 남은 대상 전체에서 같은 해시순으로 {MIN_TOTAL}건까지 보충한다.
   보충에는 등급별 상한을 적용하지 않는다. 부족하면 있는 만큼과 사유를 공개한다.
   층화 선정 순서 뒤에 보충 순서를 잇는다. 등급별 수와 편중을 숨기지 않는다.

## 등록 준비와 고정
외부 피처 공개 시점은 개최 D-14 이하, 행사 속성은 요청 입력인 조건부 정의다.
leadDays = 한국 개최일 − 등록일. 리드타임별 결과는 채점 항목의 leadDays로 구분한다.
JSONL의 SHA-256·runId·모델 버전·검증 상태와 행사 스냅샷을 준비본 메타에 보존한다.
예보 수치는 JSONL에서 그대로 복사하며 재추론하지 않는다. 같은 입력은 같은 바이트다.
기본 register/--dry-run은 data/processed/prereg_payloads.json에만 쓰고 통신하지 않는다.
테스트는 임시 경로만 쓰고 선정·dry-run의 공개 산출물은 RULES.md뿐이다.
--send는 매 POST 직전에 KST 등록일을 검사하며 자정을 넘으면 남은 전송을 중단한다.
이미 등록된 예보·미전송 예보·응답 확인이 필요한 예보는 data/processed/prereg_send_status.json에 기록한다.
--send 전체 성공 때만 {PUBLIC_META}를 생성한다.
공개 메타에는 준비본 파일 SHA-256·JSONL SHA-256·runId·모델 버전·검증 상태·선정 eventId·forecastId를 고정한다.
현 원장 계약은 메타를 해시 체인에 넣지 못한다. 오케스트레이터가 공개 메타를 공개 커밋·태그에 함께 고정한다.

## 채점
API 반영 약 31일: 10월 종료 행사는 자료 공개 뒤 11월 채점한다. 대회에서는 절차·일정을 제시한다.
원장 항목의 숫자를 기준으로 T-103 crowdcast.labels.silver.build_silver를 그대로 호출한다.
로컬 준비본 전체 바이트의 SHA-256이 공개 메타와 같을 때만 채점한다. 메타 누락·불일치는 거부한다.
원장 forecastId 집합은 준비본·공개 메타의 전체 집합과 같아야 한다. 빈 원장·일부 누락·추가도 거부한다.
등록 준비본·공개 메타·원장이 모두 없을 때만 등록 전 0건 응답을 허용한다.
실측 = 행사 기간 날마다 (시군구 방문 − 행사 시작 전 {BASELINE_WINDOW}일 같은 요일 중앙값)의 평균.
기준선은 KR 공휴일 제외·필요 요일별 ≥ {MIN_BASELINE_DAYS}일·잔차 표본 표준편차(ddof=1)다.
기간의 세 방문자 구분이 한 날이라도 누락되면 대기, 취소·연기는 취소다.
취소·연기는 data/processed/prereg_status.json만 사용한다.
형식: [{{eventId, status: 취소|연기, source, checkedAt}}].
파일이 없으면 빈 목록이다. 빈 출처·시간대 없는 확인 시각·중복 행사 등 잘못된 항목은 채점을 거부한다.
CLI score는 scores와 statusSources(취소·연기 출처·확인 시각)를 함께 출력한다.
현재 API 계약에는 출처 필드가 없어 상태·건수만 반환하며 출처 필드는 계약 확장 후 반영한다.
신호 ≤ 3σ, σ=0, 음수, 명절 겹침 또는 기준선 부적합은 채점 불가다(T-103 품질 판정).
채점 불가·취소는 분모에서 빼고 건수를 공개한다. 대기도 분모에 넣지 않는다.
구간 포함 = p10 ≤ 반올림 전 실버 실측 ≤ p90. 포함 건수/채점 완료 건수를 공개한다.
등급 일치 = 실측을 세 분위수로 반복해 기존 distribution 환산·judge에 넣은 등급과 비교한다.
행사 유형·기간·위험 요소·seed·표본 수·환산 설정은 등록 준비본에 고정하며 변경 시 채점을 거부한다.
백테스트 성적과 사전 등록 성적은 합치지 않는다. 실버는 시군구 순증 추정이며 행사장 직접 실측이 아니다.
"""


# 모델 고지와 기계적 선정 집계를 같은 함수로 문서와 준비본에 반영한다.
def render_rules(metadata: dict[str, Any], selection: dict[str, Any]) -> str:
    counts = selection["levelCounts"]
    levels = ", ".join(f"{level}등급 {counts[str(level)]}건" for level in LEVELS)
    return rules_text() + (
        f"\n## 실행 고지\n사용 모델: {metadata['modelVersion']} / {metadata['verdict']}.\n"
        f"G0: {metadata['g0']['primary_model']} (simple=단순 모델), {metadata['g0']['basis']} 표시.\n"
        f"백테스트 v1: 평가 {metadata['backtest']['evaluated']}건, "
        f"포함 {metadata['backtest']['covered']}/{metadata['backtest']['evaluated']}.\n{PROMISE}\n"
        f"선정 {selection['selected']}건: {levels}.\n"
        f"등급 편중: {selection['imbalance']}. 부족 사유: {selection['shortfallReason']}.\n"
        "\n아래는 문서 재생성용 실행 메타이며 원장 등록 내역이 아니다.\n"
        "```json\n" + canonical({"metadata": metadata, "selection": selection}) + "\n```\n"
    )
