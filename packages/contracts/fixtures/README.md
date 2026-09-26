# 계약 픽스처

- `fixtures/`: `valid-*`는 스키마를 통과하고 `invalid-*`는 거부되어야 한다. TS(Ajv)·Python(jsonschema)·PHP(opis)가 같은 판정이어야 한다.
- `../fixtures-integrity/`: 스키마는 통과하지만 **문서 안 id 참조가 끊긴** 경우. 참조 무결성 검사(`scripts/check.mjs`)와 근거 그래프 적재가 거부해야 한다.
- 값은 계약 검사용 **예시**다(실측·예측 결과가 아니다).
