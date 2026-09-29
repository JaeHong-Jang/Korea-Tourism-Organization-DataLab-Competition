"""사전 등록한 채택 조건 C1~C5를 저장된 점수만으로 판정한다."""


# 조건마다 규칙·비교값·통과 여부를 함께 남겨 화면과 문서가 같은 근거를 읽게 한다.
def judge(dev: dict, yearly: dict, large: dict, holiday: dict) -> dict:
    checks = [
        {
            "id": "C1",
            "rule": "2024 개발 MAE·pinball이 모두 유형별 중앙값보다 낮다",
            "values": {
                "v2_mae": dev["v2"]["mae"],
                "type_median_mae": dev["type_median"]["mae"],
                "v2_pinball": dev["v2"]["pinball"],
                "type_median_pinball": dev["type_median"]["pinball"],
            },
            "passed": dev["v2"]["mae"] < dev["type_median"]["mae"]
            and dev["v2"]["pinball"] < dev["type_median"]["pinball"],
        }
    ]
    for year, item in yearly.items():
        checks.append(
            {
                "id": f"C2-{year}",
                "rule": f"{year} MAE가 유형별 중앙값과 v1보다 낮다",
                "values": {
                    "v2_mae": item["v2"]["mae"],
                    "type_median_mae": item["type_median"]["mae"],
                    "v1_mae": item["v1"]["mae"],
                },
                "passed": item["v2"]["mae"] < item["type_median"]["mae"]
                and item["v2"]["mae"] < item["v1"]["mae"],
            }
        )

    # 보류 사유 2는 큰 양수 순증과 명절을 v1과 같은 기준·같은 행으로 비교한다.
    checks.append(
        {
            "id": "C3",
            "rule": "2025·2026 큰 양수 순증: 포함률 50% 이상, MAE가 v1보다 낮다",
            "values": {
                "v2_coverage": large["v2"]["coverage"],
                "v1_coverage": large["v1"]["coverage"],
                "v2_mae": large["v2"]["mae"],
                "v1_mae": large["v1"]["mae"],
                "n": large["v2"]["n"],
            },
            "passed": large["v2"]["coverage"] >= 0.5 and large["v2"]["mae"] < large["v1"]["mae"],
        }
    )
    checks.append(
        {
            "id": "C4",
            "rule": "2025·2026 명절: MAE가 v1보다 높지 않다",
            "values": {
                "v2_mae": holiday["v2"]["mae"],
                "v1_mae": holiday["v1"]["mae"],
                "n": holiday["v2"]["n"],
            },
            "passed": holiday["v2"]["mae"] <= holiday["v1"]["mae"],
        }
    )
    for year, item in yearly.items():
        coverage = item["v2"]["coverage"]
        checks.append(
            {
                "id": f"C5-{year}",
                "rule": f"{year} 전체 구간 포함률이 75% 이상 90% 이하다",
                "values": {"v2_coverage": coverage},
                "passed": 0.75 <= coverage <= 0.90,
            }
        )
    return {"checks": checks, "adopted": all(c["passed"] for c in checks)}
