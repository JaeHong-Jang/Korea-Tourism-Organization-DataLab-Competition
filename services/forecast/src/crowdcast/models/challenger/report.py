"""도전 모델 비교표·분할·근사 추론 한계를 별도 보고서로 기록한다."""

import hashlib
import json
from pathlib import Path
from typing import Any

from crowdcast.models.card import CONDITIONAL_DEFINITION
from crowdcast.models.report_tables import challenger_table


# 순서·날짜 표현·비유한 값 처리를 고정해 산출물을 재현 가능한 바이트로 만든다.
def json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False, default=str) + "\n"
    ).encode("utf-8")


# 점수와 함께 건너뛴 폴드·추론 방식·검증 한계를 같은 문서에서 확인할 수 있게 한다.
def markdown(comparison: dict[str, Any]) -> str:
    config = comparison["config"]
    lines = [
        *challenger_table(comparison),
        "",
        f"PyMC {comparison['pymcVersion']}; 추론={config['method']}; seed={config['seed']}; "
        f"draws={config['draws']}; ADVI iterations={config['iterations']}; "
        f"NUTS chains={config['chains']}, tune={config['tune']} (선택한 방식에만 적용).",
        "평균장 ADVI는 속도를 위한 근사이며 NUTS와 동등한 표본으로 주장하지 않는다. "
        "수렴은 확인하지 않았고 80%는 명목 구간이다. 체인·반복 수를 성적에 따라 튜닝하지 않았다.",
        "log 일평균 ~ 절편 + 유형·시도 부분 풀링 + 학습에서 결측 대체·표준화한 공변량; "
        "학습에서 상수이거나 전부 결측인 공변량은 제외한다. "
        "Student-t 가중 우도(기준 실행의 골드·실버 가중치). "
        "사후 예측에는 잔차와 새 계층 불확실성이 포함된다.",
        "학습 ≤ Y−2만 적합한다. 보정 Y−1 라벨은 도전 모델 적합·구간 보정에 쓰지 않는다. "
        "비교 LightGBM은 저장된 MAPIE CQR 구간이며 평가 행사는 동일하다.",
        f"{CONDITIONAL_DEFINITION}. 외부 관측의 available_at ≤ as_of만 검사하며 "
        "입력 행사 유형·시도·규모 속성의 실제 D-14 공개를 주장하지 않는다.",
        "실버는 시군구 순증 보조 정답으로 행사장 골드와 정의가 다르다. "
        "환산 판정 재현율은 추정 산식 기반이며 실제 순간 인원의 정답이 아니다. "
        "대상 미만 표본이 없으면 판정 경계 성능을 주장할 수 없다.",
        "두 모델 합의는 같은 일평균 단위의 80% 구간 교집합 길이 / 합집합 길이(IoU)이다. "
        "합의율은 정확도·발생 확률이 아니다. "
        "JSON Schema 검증 후에도 근거 그래프 SHACL 통과 전에는 발행하지 않는다.",
        "기본 모델·사용/후보 포인터·사전 등록 예보는 변경하지 않는다. "
        "합의 근거는 기본 꺼짐이며 예보 경로에는 연결하지 않았다. 참고용 — 담당자 검토 필수",
        "",
        "### 분할",
        "",
        "| 평가 연도 | 학습 N | 보정 N | 평가 N | 결과 |",
        "|---:|---:|---:|---:|---|",
        *[
            f"| {fold['year']} | {fold['train_n']} | {fold['calibration_n']} | {fold['evaluation_n']} | "
            f"{fold['skipped'] or '실행'} |"
            for fold in comparison["folds"]
        ],
        "",
        "### 입력 SHA-256",
        "",
        *[f"- {name}: `{digest}`" for name, digest in comparison["inputHashes"].items()],
        "",
        "소요 시간은 같은 폴더의 execution.json에 기록한다. 전체 점수·진단은 comparison.json에 기록한다.",
        "",
    ]
    return "\n".join(lines)


# 모델·비교 보고서의 실제 바이트 해시를 한 목록에 기록하고 목록 자체는 제외한다.
def artifact_hashes(models: Path, reports: Path, model_name: str, run_id: str) -> dict[str, str]:
    return {
        f"{prefix}/{path.relative_to(root)}": hashlib.sha256(path.read_bytes()).hexdigest()
        for root, prefix in (
            (models, f"models/{model_name}"),
            (reports, f"reports/backtest/{run_id}/challenger"),
        )
        for path in sorted(root.rglob("*"))
        if path.is_file() and path.name != "artifact_hashes.json"
    }
