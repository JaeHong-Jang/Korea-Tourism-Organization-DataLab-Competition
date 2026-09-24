# 작업 원장

| task | 워커 모델 | 상태 | 종료코드 | 게이트 1~4 | 리뷰 모델·결론 | 커밋 | 산출물 해시 |
|---|---|---|---|---|---|---|---|
| T-000 | Claude(오케스트레이터) | done | — | G1 ✓ · G2 check ✓ | — | 453732f | — |
| T-001 v1 | Claude(오케스트레이터) | 되돌림 | — | G2 check 27·오류 0 | gpt-6-astra R-01 1차 FAIL(High 9·Med 1) | caa098b | — |
| T-001 v1.1 | Claude(오케스트레이터) | 되돌림 | — | G2 check 27·41·오류 0 | gpt-6-astra R-01 2차 FAIL(High 1 + 부분 해결 4) | 7635e0a | — |
| T-001 v1.2 | Claude(오케스트레이터) | 되돌림 | — | G2 check 29·79·오류 0 | gpt-6-astra R-01 3차 FAIL(High 1·Med 4) | 8c5e2d2 | b55819206f3c |
| T-001 v1.3 | Claude(오케스트레이터) | 되돌림 | — | G2 check 29·101·오류 0 | gpt-6-astra R-01 4차 FAIL(High 1 회귀·Med 3) | 6d80b3b | — |
| T-001 v1.4 | Claude(오케스트레이터) | 되돌림 | — | G2 check 29·118·오류 0 | gpt-6-astra R-01 5차 FAIL(High 1·Med 2) | b34521b | — |
| T-001 v1.5 | Claude(오케스트레이터) | done | — | G2 check 29·128·오류 0 | gpt-6-astra R-01 6차 **PASS**(High 0·Med 1) | 0590c11 | — |
| T-001 v1.5.1 | Claude(오케스트레이터) | done | — | G2 check 29·129·오류 0 | R-01 6차 Med 1 반영(masterVersion 재검사) — 다음 교차 리뷰에서 확인 | (이 커밋) | — |
| T-401 | gpt-6-sol | done | 0 | G1 ✓ · G2 build·test 4·lint·e2e 10·스크린샷 9·Range 206 ✓ · G3 astra PASS(Med 4 이월) · G4 ✓(명세 코드 숨기기 이월) | gpt-6-astra PASS | d5db41a | 스크린샷 9장 해시는 reports/T-401.md |
| T-501 | gpt-6-sol | done | 0·0·0(3회) | G1 ✓ · G2 test 7·46·stan 0·우회 7종 거부 ✓ · G3 astra FAIL→FAIL→PASS · G4 ✓ | gpt-6-astra 3차 PASS | a288638 | — |
| T-201 | gpt-6-astra | done | 0 | G1 ✓ · G2 test 38·ruff·✓ forecast · G3 sol PASS · G4 ✓(PyYAML 의존성 명시는 통합에서) | gpt-6-sol PASS | f2b0916 | — |
| T-601 | gpt-6-astra | done | 0·0(2회: PARTIAL→후속) | G1 ✓ · G2 test 89·ruff·✓ knowledge · G3 sol PASS(판정 불일치 0/112) · G4 가정값 06 §4 대조 ✓ | gpt-6-sol PASS | a97cacd | — |
