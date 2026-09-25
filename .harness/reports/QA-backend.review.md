[High] [announced.py](/home/data/crowdcast-run/services/forecast/src/crowdcast/features/announced.py:24), [upcoming.py](/home/data/crowdcast-run/services/forecast/src/crowdcast/analytics/upcoming.py:227) — `with_announced`는 정의만 있고, 다가오는 행사 예보 경로는 마스터의 발표치를 피처 입력으로 전달하지 않습니다. v2를 승격해도 해당 예보에서는 발표치가 결측이어서 T-203b의 규모 편향 개선이 작동하지 않습니다. — 같은 행사 마스터의 발표치를 일괄 예보 피처에 연결하고, 승격 후보로 실제 피처 값과 등급 분포를 검증하세요.

[Med] [report_tables.py](/home/data/crowdcast-run/services/forecast/src/crowdcast/models/report_tables.py:17) — 보고서는 보정비율을 “발표치 일평균 ÷ 학습 라벨의 가중 중앙값”으로 설명하지만, [실제 코드](/home/data/crowdcast-run/services/forecast/src/crowdcast/models/baselines.py:61)는 행사별 비율의 가중 중앙값을 구합니다. 라벨 규모가 다르면 두 값은 달라 모델 산식 보고가 틀립니다. — 보고서의 산식을 실제 계산에 맞추세요.

파일 수정이나 서비스 실행 없이 정적으로 검토했습니다.

VERDICT: FAIL