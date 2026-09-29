# T-research-silver-expansion: 실버 전체 후보의 순증 모델 연구

- 사용자 승인: 2026-09-28, 합의한 분할로 학습·검증 진행.
- 목표: 음수를 보존한 실버 1,804건의 별도 연구 학습·월별 백테스트를 재현 가능하게 실행한다.
- 허용 경로: `services/forecast/src/crowdcast/research/`, `services/forecast/tests/research/`, `docs/research/silver-expansion-20260928/`, `.harness/tasks/T-research-silver-expansion.md`, `.harness/reports/T-research-silver-expansion.md`, `reports/backtest/silver-expansion-20260928/`.
- 입력: 기존 labels/events/region_daily parquet 읽기 전용.
- 산출: 후보·피처·분할 ID·월별 예측·모델·점수·원본 해시·한국어 결과 보고서.
- 범위 밖: 웹, 운영 모델 교체, 원본/기존 가공 데이터 변경, 계약 변경, 커밋·푸시.
- 외부 호출·의존성 설치: 없음. 설치된 LightGBM 4.6과 표준 unittest 사용.
- 수용 기준: `.venv/Scripts/python.exe -B -m unittest discover -s services/forecast/tests/research -v`; `.venv/Scripts/python.exe -B -m crowdcast.research.silver_expansion.run --data-root ../관광데이터_공모전/01_data/crowdcast-data-20260926-v2 --output reports/backtest/silver-expansion-20260928`.
- 사전 확정: 2024년 4개 조합을 MAE 우선, 동률 pinball/단순성 순으로 선택; 2025/2026에서 재선택 없음.
- 사전 확정: 예산·발표 인원·전회차 인원 피처 제외, 28일 라벨 유지, 기존 지역 관측 창 유지.
- 사전 확정: SNR 대조군은 같은 학습 후보에서 SNR>3만 선택하고 보정·평가는 전체모델과 동일. 대조군만 최소 20행을 허용하는 소표본 참고 실험이며 미달 월은 채점 제외 및 공통 행사로 비교.
- 사전 확정: 연도 분할 대조군은 연초 공개 시점을 고정, Y-2까지 학습·Y-1 보정, 100개 학습 군집 미달 연도는 미제공.
- 사전 확정: 관측 구간별 1/k 가중치, 20% 군집 보정(올림·최소50), 학습100군집 기준, 가중 경험 80% CQR 확장, 원단위 signed 타깃.
- 검토: AGENTS.md에 따라 읽기 전용 교차 리뷰를 수행한다.
- 추가 수용 기준: `python -B -m crowdcast.research.silver_expansion.diagnostics --data-root ../관광데이터_공모전/01_data/crowdcast-data-20260926-v2 --output reports/backtest/silver-expansion-20260928`에서 합의한 분할 수·기존 피처·원본 해시·평가 ID 검사 통과.
