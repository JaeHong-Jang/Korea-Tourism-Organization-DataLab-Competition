# 작업 원장

| task | 워커 모델 | 상태 | 종료코드 | 게이트 1~4 | 리뷰 모델·결론 | 커밋 | 산출물 해시 |
|---|---|---|---|---|---|---|---|
| T-000 | Claude(오케스트레이터) | done | — | G1 ✓ · G2 check ✓ | — | 453732f | — |
| T-001 v1 | Claude(오케스트레이터) | 되돌림 | — | G2 check 27·오류 0 | gpt-6-astra R-01 1차 FAIL(High 9·Med 1) | caa098b | — |
| T-001 v1.1 | Claude(오케스트레이터) | 되돌림 | — | G2 check 27·41·오류 0 | gpt-6-astra R-01 2차 FAIL(High 1 + 부분 해결 4) | 7635e0a | — |
| T-001 v1.2 | Claude(오케스트레이터) | 되돌림 | — | G2 check 29·79·오류 0 | gpt-6-astra R-01 3차 FAIL(High 1·Med 4) | 8c5e2d2 | b55819206f3c |
| T-001 v1.3 | Claude(오케스트레이터) | 되돌림 | — | G2 check 29·101·오류 0 | gpt-6-astra R-01 4차 FAIL(High 1 회귀·Med 3) | 6d80b3b | — |
