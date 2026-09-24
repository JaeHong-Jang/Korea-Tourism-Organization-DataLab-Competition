"""모델 카드 등록 요청과 사용 모델 포인터의 기동 적재를 처리한다."""

import logging
import re
from datetime import datetime
from typing import Annotated

import orjson
from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse
from knowledge import paths
from knowledge.api.contract_response import contract_response
from knowledge.convert.documents import schema_problems
from knowledge.store.facts import IntegrityError, KnowledgeStore, violations_for

router = APIRouter()
logger = logging.getLogger(__name__)


# 선택 의존성 없는 jsonschema 환경에서도 모델 생성 시각의 date-time 계약을 지킨다.
def card_problems(card: dict) -> list[str]:
    problems = schema_problems(card, "model-card")
    if problems:
        return problems
    created_at = card["createdAt"]
    timestamp_pattern = (
        r"\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?"
        r"([Zz]|[+-]([01]\d|2[0-3]):[0-5]\d)"
    )
    if not re.fullmatch(timestamp_pattern, created_at):
        return ["$.createdAt: 시간대가 있는 date-time이어야 한다"]
    try:
        datetime.fromisoformat(created_at.upper())
    except ValueError:
        return ["$.createdAt: 유효한 date-time이어야 한다"]
    return []


# 계약 위반과 동일 id의 내용 충돌을 구분하고 기존 기준 그래프 등록을 재사용한다.
@router.post("/v1/master/model-runs")
def model_runs(request: Request, card: Annotated[dict, Body()]) -> JSONResponse:
    store = request.app.state.knowledge
    problems = card_problems(card)
    if problems:
        raise IntegrityError(0, store.master.snapshot()[0], violations_for("", problems))
    try:
        version = store.master.register_model_run(card)
    except ValueError as error:
        report = IntegrityError(0, store.master.snapshot()[0], violations_for(card["id"], [str(error)]))
        return contract_response(report.report, status_code=409)
    return contract_response({"masterVersion": version}, "master-version")


# 누락·손상·충돌 시 가짜 모델을 만들지 않고 경고 후 서비스 기동을 계속한다.
def load_promoted_model(store: KnowledgeStore) -> None:
    try:
        pointer = orjson.loads((paths.DATA_ROOT / "reports/backtest/promoted.json").read_bytes())
        model_version = pointer["modelVersion"]
        if (
            not isinstance(model_version, str)
            or not model_version
            or model_version in {".", ".."}
            or "/" in model_version
            or "\\" in model_version
        ):
            raise ValueError("사용 모델 버전은 디렉터리 이름이어야 한다")
        card = orjson.loads((paths.DATA_ROOT / "models" / model_version / "model_card.json").read_bytes())
        if not isinstance(card, dict) or card.get("modelVersion") != model_version:
            raise ValueError("사용 모델 포인터와 모델 카드 버전이 다르다")
        if card_problems(card):
            raise ValueError("모델 카드가 계약을 위반한다")
        version = store.master.register_model_run(card)
    except (OSError, ValueError, KeyError, TypeError) as error:
        logger.warning("사용 모델 카드 기동 적재 실패: exception=%s", type(error).__name__)
        return
    logger.info("사용 모델 카드 등록: modelVersion=%s masterVersion=%s", model_version, version)
