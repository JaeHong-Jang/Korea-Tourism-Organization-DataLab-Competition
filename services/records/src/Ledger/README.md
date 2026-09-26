# 사전 등록 원장 해시 규칙

각 항목의 `payload`는 `seq`, `forecastId`, `eventId`, `registeredAt`, `leadDays`, `forecast`만 담는다. 객체의 키를 모든 깊이에서 사전순으로 정렬하고 공백 없는 UTF-8 JSON으로 직렬화한다. 정수는 정수로 유지한다. PHP 인코딩 옵션은 `JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES`이다.

`payloadHash = sha256(payload)`이고 `hash = sha256(prevHash + payloadHash)`이다. SHA-256 결과는 소문자 16진 문자열로 쓴다. `+`는 두 64자 16진 문자열을 그대로 이어 붙인다는 뜻이다. 첫 항목의 `prevHash`는 `0` 64개다. `seq`는 1부터 연속이다. 등록 시각은 서버의 KST ISO 8601 문자열이다.

다음은 **계산 검사용 예시**이며 실제 사전 등록 예보가 아니다. 영종 씨사이드파크 불꽃축제 행사 ID를 사용한다.

```json
{"eventId":"e-yeongjong-fireworks-2025","forecast":{"dailyMeanP10":100,"dailyMeanP50":200,"dailyMeanP90":300,"level":2},"forecastId":"f-example-yeongjong-2025","leadDays":5,"registeredAt":"2026-09-29T09:00:00+09:00","seq":1}
```

- `payloadHash`: `910112546f85d22fca0491997d1ea3dbf40c01c145341c1aa9c8dd13c61c74c2`
- `prevHash`: `0000000000000000000000000000000000000000000000000000000000000000`
- `hash`: `6062dd89784ba774946c37f5f254aee3367c91c736f25404028a41c064680a9f`

`GET /v1/ledger/verify`는 저장본의 모든 항목을 처음부터 재계산한다. `php services/records/bin/ledger-export.php`는 검증된 원장을 `reports/preregistered/ledger.csv`에 내보낸다. 공개 커밋·태그에 고정된 마지막 해시와 행 수를 함께 비교해야, 저장소 밖에서 원장 끝부분을 통째로 제거한 경우도 찾을 수 있다.
