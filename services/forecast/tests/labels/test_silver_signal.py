"""신호 유지의 연도별 비율·첫 실행 하한·저장된 비교 근거의 검증을 확인한다."""

from copy import deepcopy
from typing import Any

import pytest
from crowdcast.labels.silver_signal import signal_retention


# 서로 다른 연도 구성이 전체 비율에 가려지지 않게 연도별 분자·분모를 직접 지정한다.
def population(*years: tuple[int, int, int]) -> dict[str, Any]:
    return {
        "candidate_count": sum(candidates for _, candidates, _ in years),
        "significant_count": sum(significant for _, _, significant in years),
        "signal_by_year": [
            {"year": year, "candidate_count": candidates, "significant_count": significant}
            for year, candidates, significant in years
        ],
    }


# 동일 스냅샷의 기준값과 판정 필드를 따로 변조할 수 있는 직전 감사를 만든다.
def audit(silver: dict[str, Any], prior: dict[str, Any] | None = None) -> dict[str, Any]:
    silver = deepcopy(silver)
    silver["signal_retention"] = signal_retention(silver, prior, "b" * 64)
    return {"schema_version": 2, "snapshot_sha256": "b" * 64, "silver": silver}


# 후보 수가 달라도 비율이 직전의 정확히 80%이면 통과한다.
@pytest.mark.parametrize(
    "candidates,significant,status",
    [(200, 79, "fail"), (200, 80, "pass"), (50, 20, "pass"), (200, 100, "pass")],
)
def test_ratio_retention_boundary(candidates: int, significant: int, status: str) -> None:
    previous = audit(population((2025, 100, 50)))
    check = signal_retention(population((2025, candidates, significant)), previous, "c" * 64)
    assert check["status"] == status
    assert check["by_year"][0]["previous_numerator"] == 50
    assert check["by_year"][0]["previous_denominator"] == 100


# 첫 실행에서 29건은 중단하고 정확히 30건부터 통과한다.
@pytest.mark.parametrize("count,status", [(29, "fail"), (30, "pass")])
def test_first_run_minimum(count: int, status: str) -> None:
    current = population((2025, 100, count))
    first = signal_retention(current, None, "b" * 64)
    assert first["status"] == status
    assert first["first_run_minimum"]["denominator"] == 30
    previous = audit(current)
    assert signal_retention(current, previous, "b" * 64) == first


# 신규 연도 대량 추가나 다른 연도의 성장으로 기존 연도 신호 붕괴가 가려지지 않는다.
def test_compare_each_year_and_missing_year() -> None:
    previous = audit(population((2024, 100, 50), (2025, 100, 50)))
    current = population((2023, 1000, 0), (2024, 100, 20), (2025, 100, 90))
    check = signal_retention(current, previous, "c" * 64)
    assert check["status"] == "fail" and check["by_year"][1]["status"] == "fail"
    current = population((2023, 1000, 0), (2024, 100, 50), (2025, 100, 50))
    assert signal_retention(current, previous, "c" * 64)["status"] == "pass"
    assert signal_retention(population((2025, 100, 50)), previous, "c" * 64)["status"] == "fail"


# 같은 해시의 저장 판정을 pass로 바꿔도 원래 기준값으로 재계산해 실패한다.
def test_same_snapshot_does_not_trust_status() -> None:
    baseline = audit(population((2025, 100, 100)))
    current = population((2025, 100, 60))
    baseline["snapshot_sha256"] = "a" * 64
    previous = audit(current, baseline)
    previous["silver"]["signal_retention"]["status"] = "pass"
    previous["silver"]["signal_retention"]["by_year"][0]["status"] = "pass"
    assert signal_retention(current, previous, "b" * 64)["status"] == "fail"


# 동일 스냅샷 경로도 잘못된 필드·타입·분자·분모·비율을 거부한다.
@pytest.mark.parametrize(
    "field,value",
    [("numerator", True), ("denominator", "100"), ("denominator", 0), ("ratio", 0.1), ("status", 1)],
)
def test_invalid_previous_comparison(field: str, value: Any) -> None:
    current = population((2025, 100, 50))
    previous = audit(current)
    previous["silver"]["signal_retention"]["by_year"][0][field] = value
    with pytest.raises(ValueError, match="직전 labels_g0.json"):
        signal_retention(current, previous, "b" * 64)


# 분모보다 큰 분자·연도 중복·전체 합계 불일치를 기준값으로 허용하지 않는다.
@pytest.mark.parametrize(
    "rows", [[(2025, 40, 50)], [(2025, 100, 50), (2025, 100, 50)], [(2025, 0, 0)], [(True, 100, 50)]]
)
def test_invalid_population(rows: list[tuple[int, int, int]]) -> None:
    with pytest.raises(ValueError, match="직전 labels_g0.json"):
        signal_retention(population(*rows), None, "b" * 64)
