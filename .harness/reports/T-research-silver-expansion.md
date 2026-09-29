## T-research-silver-expansion 결과: DONE

- 변경 파일: `services/forecast/src/crowdcast/research/silver_expansion/` 기능별 연구 모듈, `services/forecast/tests/research/test_silver_expansion.py`, `docs/research/silver-expansion-20260928/results.md` 및 상태 안내, 해당 task·report.
- 수용 기준: `.venv/Scripts/python.exe -B -m unittest discover -s services/forecast/tests/research -v` → 5개 통과.
- 수용 기준: `.venv/Scripts/python.exe -B -m crowdcast.research.silver_expansion.run --data-root ../관광데이터_공모전/01_data/crowdcast-data-20260926-v2 --output reports/backtest/silver-expansion-20260928` → exit 0, 2024 개발 439행·2025 평가 635행·2026 평가 358행, 최신 연구 스냅샷 학습 1,443행·보정 361행.
- 수용 기준: 같은 경로로 `crowdcast.research.silver_expansion.diagnostics` 실행 → exit 0, 기존 지역 피처 284행×3열 일치, 원본 3파일 해시 동일, 평가 ID 중복·분할 군집 교차 없음.
- 교차 리뷰: High 없음. 강한 순증·명절의 악화를 숨기지 말라는 Med를 결과 문서에 반영. 2024 개발에서 유형 중앙값 MAE를 넘지 못했으므로 채택 조건 미충족을 명시.
- 구현 이슈: 기존 region_features의 전이 의존성이 Windows 미지원 fcntl을 불러와 첫 시작이 실패했다. 원본 모듈은 바꾸지 않고 연구 전용 집계 모듈로 동일 피처를 재현했고 실제 교집합에서 차이 0을 확인했다.
- 의존성 변경: 없음. 외부 API 호출 없음.
- CONTRACT-CHANGE: 없음.
- BLOCKED: 없음.
- 남은 일·주의: 연구 실행 완료이며 운영 적용은 하지 않음. 최신 스냅샷은 앞선 평가 자료도 재학습하므로 과거 점수를 최신 스냅샷의 독립 평가로 해석하지 않음. 행사장 인원·순간 최대를 검증한 결과가 아님. 데이터·모델 산출물은 기존 reports/backtest Git 제외 규칙을 유지.
- 상세 결과: `docs/research/silver-expansion-20260928/results.md`.
- 산출물 해시: `reports/backtest/silver-expansion-20260928/artifact_hashes.json`.
