## QA-1-backend 결과: DONE

- 변경 파일: `features/announced.py`, `api/assemble/{inputs,observations}.py`, `analytics/upcoming.py`, `models/report_tables.py`, `tests/api/assemble/test_announced.py` — 모두 forecast 내부.
- 반영: 두 예보 경로에 마스터 발표치 연결. 직접 입력값 우선·미매칭 결측 유지. 보고서 산식을 **행사별 비율의 가중 중앙값**으로 수정.
- 수용 기준: `.venv/bin/python /tmp/t204b_pytest_backend.py -q services/forecast/tests` → **1,421 통과**. `.venv/bin/ruff check services/forecast`·`git diff --check` → 통과.
- 회귀 확인: 실제 v1 단건 응답·일괄 18건 파일의 바이트 동일. 실제 v2 후보의 발표치 전달 확인.
- 의존성 변경: 없음.
- CONTRACT-CHANGE: 없음.
- BLOCKED: 없음.
- 남은 일·주의: 기본 pytest는 asyncio `TestClient` 대기로 시간 초과(124); 기존 uvloop 래퍼로 전체 검증했습니다. 후보 v2의 확인 대상 18건은 모두 4등급이며, 모델 승격·공유 산출물 변경은 없습니다.