"""발표치 규모 후보의 동일 모집단 검사와 승격·등급 분포 표를 만든다."""

from typing import Any

from crowdcast.models.backtest import metrics
from crowdcast.models.report_tables import number


# 학습·보정·평가 폴드와 평가 라벨이 하나라도 달라지면 성적을 비교하지 않는다.
def assert_same_population(
    before_folds: list[dict[str, Any]],
    after_folds: list[dict[str, Any]],
    before: list[dict[str, Any]],
    after: list[dict[str, Any]],
) -> None:
    if before_folds != after_folds:
        raise ValueError("사용 모델과 후보의 롤링 폴드가 다릅니다")

    # ID뿐 아니라 단위·정답·환산 판정도 같은지 확인한다.
    def labels(points: list[dict[str, Any]]) -> dict[tuple[int, str], tuple[Any, ...]]:
        rows = [p for p in points if p["model"] == "simple"]
        result = {
            (p["year"], p["eventId"]): (p["actual"], p["tier"], p["spatial_scope"], p["actual_level"])
            for p in rows
        }
        if len(result) != len(rows):
            raise ValueError("비교 평가 행사 중복")
        return result

    if labels(before) != labels(after):
        raise ValueError("사용 모델과 후보의 평가 라벨이 다릅니다")


# 포함 건수와 판정 분모를 함께 기록해 미검증·좁은 표본을 숨기지 않는다.
def comparison_metrics(points: list[dict[str, Any]]) -> dict[str, Any]:
    points = [p for p in points if p["model"] == "simple"]
    return {
        **metrics(points),
        "covered": sum(p["p10"] <= p["actual"] <= p["p90"] for p in points),
        "actualPositive": sum(p["actual_level"] >= 3 for p in points),
        "announcedUsed": sum(p.get("scale_source") == "announced" for p in points),
    }


# 기존 승격 함수의 판정을 재해석하지 않고 사용 제안과 검증 상태를 구분한다.
def comparison_markdown(comparison: dict[str, Any]) -> str:
    lines = [
        "# 발표치 규모 계층 비교",
        "",
        f"사용 모델 `{comparison['baseModelVersion']}` → 후보 `{comparison['modelVersion']}`.",
        "같은 입력 해시·폴드·라벨로 비교했다. 주 모델 simple·G0 구간 표시와 임계값은 유지한다.",
        "",
        "| 모델 | MdAPE(%) | 80% 포함률 | 포함/N | 판정 재현율 | 실제 대상 이상 N | 발표치 사용 N |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name, row in comparison["metrics"].items():
        lines.append(
            f"| {name} | {number(row['mdape'])} | {number(row['coverage80'])} | "
            f"{row['covered']}/{row['coverageN']} | {number(row['judgmentRecall'])} | "
            f"{row['actualPositive']} | {row['announcedUsed']} |"
        )
    old, new = comparison["metrics"]["v1"], comparison["metrics"]["candidate"]
    lines += [
        "",
        f"차이: MdAPE {new['mdape'] - old['mdape']:+.6f}%p, "
        f"포함률 {new['coverage80'] - old['coverage80']:+.6f}. 허용폭: +3%p / −0.05.",
        "",
        f"자동 게이트: {comparison['gate']['message']}",
        f"승격 제안: {comparison['recommendation']} (실제 포인터 갱신 없음).",
        "",
        "## 다가오는 행사 등급 분포",
        "",
        "저장된 예보의 행사 집합·asOf를 재사용하고 후보는 메모리에서만 환산했다.",
        "",
        "| 모델 | 1 소규모 | 2 권고 | 3 대상 | 4 대규모 | N |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    preview = comparison["upcoming"]
    for name, counts in preview["levels"].items():
        lines.append(
            f"| {name} | {counts['1']} | {counts['2']} | {counts['3']} | {counts['4']} | {preview['n']} |"
        )
    available = preview["announcementAvailability"]
    lines += [
        "",
        f"발표치 입력 {available.get('announced', 0)}건, 공개일 확인 {available.get('dated', 0)}건, "
        f"공개일 ≤ asOf인 양수 발표치 {available.get('eligible', 0)}건.",
        f"후보 계층 사용: {preview['scaleSources']}. 순간 최대 p50 최솟값(추정): {preview['minPeakP50']}.",
        "발표 공개일 미상은 사용하지 않는다. 파일명 날짜를 실제 공개일로 간주하지 않는다.",
        "발표치 과장 가능성은 보정비율로 줄이려 했지만 행사장 실측이 아니다. "
        "현재 자료에서 발표치 계층 사용이 0건이면 규모 구분 효과는 검증할 수 없다.",
        "골든 0건은 사례 재현 미검증이며 환산 판정은 추정 산식 기반이다. 참고용 — 담당자 검토 필수.",
        "",
        "## 보존 확인",
        "",
        f"비교 기준·포인터·기존 예보 {len(comparison['preservedHashes'])}개 파일 SHA-256 동일.",
        f"v1 재계산 분위수 SHA-256: `{preview['baselinePredictionSha256']}`.",
        "",
    ]
    return "\n".join(lines)
