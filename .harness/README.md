# .harness — 오케스트라 하네스 작업 공간 (오케스트레이터 소유)

- `tasks/T-###.md`: 워커에게 주는 작업 지시(템플릿은 `AGENTS.md` §6)
- `reports/T-###.md`, `reports/T-###.review.md`: 워커 결과·교차 리뷰(`codex exec -o`)
- `logs/`(실행 로그·종료 코드), `locks/`(레인 잠금): 실행 중에 생기며 git에 올리지 않는다
- `LEDGER.md`: task별 상태·게이트·커밋 해시 기록
- 절차: `AGENTS.md` §7
