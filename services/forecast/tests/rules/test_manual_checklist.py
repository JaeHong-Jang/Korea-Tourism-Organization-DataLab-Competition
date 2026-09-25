"""매뉴얼 계획 점검의 등급 경계·문구·출처와 기존 점검의 불변성을 검증한다."""

import json
import re
from typing import Any

import pytest
from crowdcast.api.contract import validate
from crowdcast.paths import REPO_ROOT
from crowdcast.rules.checklist import build
from crowdcast.rules.evidence import rule_settings
from crowdcast.rules.judge import judge

MANUAL_RULES = {
    "rule-check-staff-plan": "p.26·p.138",
    "rule-check-staff-distinct": "p.26",
    "rule-check-staff-focus": "p.46·p.49~50",
    "rule-check-org-chart": "표준안 p.137",
    "rule-check-org-hq": "표준안 p.142",
    "rule-check-capacity": "표준안 p.134",
}
MANUAL_URL = (
    "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do"
    "?bbsId=BBSMSTR_000000000015&nttId=113047"
)


# 같은 표본의 확률·구간 표시와 위험 우선 판정 모두 최종 등급으로 계획 점검을 켠다.
@pytest.mark.parametrize("basis", ["확률", "구간"])
@pytest.mark.parametrize(
    ("samples", "hazards", "level"),
    [
        ([0], [], 1),
        ([0] * 91 + [1000] * 9, [], 1),
        ([0] * 9 + [1000], [], 2),
        ([1000], [], 3),
        ([5000], [], 4),
        ([0], ["폭죽"], 3),
    ],
)
def test_manual_checks_follow_final_level(
    daytime_event: dict[str, Any],
    dry_weather: dict[str, Any],
    basis: str,
    samples: list[int],
    hazards: list[str],
    level: int,
) -> None:
    result = judge(samples, {**daytime_event, "hazards": hazards}, dry_weather, basis=basis)
    assert result.judgment["level"] == level
    checks = [item for item in result.judgment["checklist"] if item["ruleId"] in MANUAL_RULES]
    assert len(checks) == (6 if level >= 2 else 0)
    assert {item["ruleId"] for item in checks} == (MANUAL_RULES.keys() if level >= 2 else set())
    validate("judgment", result.judgment)

    # 발행 문장은 수치 없이 고정하고 각 근거에는 실제 등급과 문서 쪽수를 남긴다.
    evidence = {item["id"]: item for item in result.evidence}
    for item in checks:
        rule_id = item["ruleId"]
        fragment = evidence[item["evidenceIds"][0]]
        validate("evidence", fragment)
        assert fragment["kind"] == "rule" and fragment["ruleId"] == rule_id
        assert fragment["clauseId"] is None
        assert fragment["quantityIds"] == []
        assert MANUAL_RULES[rule_id] in fragment["summary"]
        assert MANUAL_URL in fragment["summary"]
        assert f'"level":{level}' in fragment["summary"]
        assert '"level_min":2' in fragment["summary"]
        assert re.search(r"\d", item["text"]) is None
        assert item["text"] == rule_settings()["rules"][rule_id]["text"]


# 기존 행사 위험 조건과 근거는 등급 전달 여부·값이 달라도 동일하게 유지한다.
@pytest.mark.parametrize("level", [None, 1, 2, 3, 4])
def test_level_only_changes_manual_checks(daytime_event: dict[str, Any], level: int | None) -> None:
    event = {**daytime_event, "hazards": ["차량진입", "폭죽"]}
    original = build(event)
    result = build(event, level=level)
    assert [item for item in result.checklist if item["ruleId"] not in MANUAL_RULES] == original.checklist
    assert [item for item in result.evidence if item["ruleId"] not in MANUAL_RULES] == original.evidence
    assert result == build(event, level=level)


# 화면용 라벨과 규칙 근거는 같은 출처를 가리키며 인원 비율·면적 권고는 문장 밖에 둔다.
def test_manual_sources_match_labels() -> None:
    labels = json.loads((REPO_ROOT / "packages/contracts/jsonld/master-labels.json").read_text())
    rules = rule_settings()["rules"]
    for rule_id, pages in MANUAL_RULES.items():
        rule = rules[rule_id]
        assert rule["kind"] == labels["rules"][rule_id]["kind"] == "자체"
        assert rule["clause_id"] is labels["rules"][rule_id]["clauseId"] is None
        assert rule["source"] == labels["rules"][rule_id]["source"]
        assert pages in rule["source"] and MANUAL_URL in rule["source"]
        assert "행정안전부 「지역축제장 안전관리 매뉴얼」(2024. 9.)" in rule["source"]
    assert "요원 인원 비율은 없" in rules["rule-check-staff-focus"]["note"]
    assert "1㎡당 4인 이하 권고" in rules["rule-check-capacity"]["note"]
