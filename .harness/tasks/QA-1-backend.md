# QA-1-backend: 전체 QA 묶음 리뷰(백엔드) 반영 — 발표치를 예보 입력에 연결, 보고서 산식 문구
- 레인/워커: L2 / gpt-6-astra        - 선행: develop 2a967fb(T-203b 병합 — 모델 v2 후보는 미승격)
- 목표(한 문장): 9/26 방문객 수집 뒤 모델을 다시 학습·승격할 때 T-203b 피처가 실제로 작동하도록, 행사 마스터의 전년 방문객수(`visitors_announced`)를 **일괄 예보·`/v1/predict` 입력 경로에 연결**하고, 보고서의 보정 비율 설명을 실제 계산과 맞춘다(`.harness/reports/QA-backend.review.md`).
- 허용 경로: `services/forecast/src/crowdcast/{features,models,analytics,api/assemble}/`, 같은 이름의 `tests/`
- 고칠 것:
  1. **High**: `features/announced.py`의 `with_announced`가 예보 경로에서 안 쓰인다 → `analytics/upcoming.py`(일괄 예보)와 `api/assemble`(`/v1/predict` — 행사 입력에 발표치가 없으면 행사 마스터에서 같은 행사 id로 찾는다, 없으면 결측)에 연결. T-203b 워커가 만든 `reports/runs/T-203b-validation/api-connection.pending.patch`(L2 워크트리)를 참고. **지금 사용 모델(v1)은 이 피처를 쓰지 않으므로 예보 결과가 바이트 그대로여야 한다**(회귀 테스트).
  2. **Med**: `models/report_tables.py:17` 보고서 문구 "발표치 일평균 ÷ 학습 라벨의 가중 중앙값"을 실제 계산(`baselines.py:61` — 행사별 비율의 가중 중앙값)에 맞춘다.
- 수용 기준: `pytest -q services/forecast/tests`(전체)·ruff, v1 사용 중 `/v1/predict`·일괄 예보 결과 바이트 동일 테스트, v2 후보 모델로 돌렸을 때 발표치 피처가 결측이 아님을 확인하는 테스트.
- 코드 규칙: AGENTS.md §5. **구현 우선 모드**.
