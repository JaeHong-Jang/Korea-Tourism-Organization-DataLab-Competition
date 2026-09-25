"""도전 모델 구간의 교집합/합집합 정의와 기본 꺼짐 동작을 경계 사례로 확인한다."""

from pathlib import Path

import pytest
from crowdcast.models.challenger.evidence import agreement_evidence, overlap_ratio


# 겹침 없음·포함·동일·영 폭·접점은 확률이 아닌 길이 비율의 정의를 따른다.
@pytest.mark.parametrize(
    ("first", "second", "expected"),
    [
        ((10, 20), (30, 40), 0),
        ((10, 20), (20, 30), 0),
        ((10, 20), (10, 20), 1),
        ((10, 30), (15, 25), 0.5),
        ((10, 30), (20, 40), 1 / 3),
        ((10, 10), (10, 10), 1),
        ((10, 10), (20, 20), 0),
    ],
)
def test_overlap(first: tuple, second: tuple, expected: float) -> None:
    assert overlap_ratio(first, second) == pytest.approx(expected)
    assert overlap_ratio(second, first) == pytest.approx(expected)


# 잘못된 구간을 정렬하거나 임의로 보정해 합의 근거로 만들지 않는다.
@pytest.mark.parametrize("interval", [(20, 10), (-1, 10), (float("nan"), 20), (10, float("inf"))])
def test_bad_intervals(interval: tuple) -> None:
    with pytest.raises(ValueError):
        overlap_ratio(interval, (10, 20))


# 기본 꺼짐이면 파일·자료가 없어도 모델이나 외부 자료를 읽지 않는다.
def test_agreement_disabled(tmp_path: Path) -> None:
    assert agreement_evidence({}, {}, tmp_path / "absent") is None
