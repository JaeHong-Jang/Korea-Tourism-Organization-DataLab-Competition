# packages/contracts — 서비스 간 계약 v1.6 (오케스트레이터 소유, 워커는 읽기 전용)

| 경로 | 내용 |
|---|---|
| `schemas/*.schema.json` | JSON Schema 2020-12 정본 29종. id는 종류 접두사(`e-` `f-` `ev-` `c-` `q-` `obs-` `pr-` `mr-` `s-` `st-` `rule-` `law-` `as-` `ds-` `fa-` `ck-`)를 가진다 |
| `openapi/{forecast,knowledge,records,gateway}.yaml` | 서비스별 OpenAPI 3.1(스키마를 `$ref`로 참조) |
| `sse-events.md` | 게이트웨이 → 웹 SSE 이벤트 순서와 원칙(게이트 A 뒤엔 숫자 카드만, 문장·근거는 발행 뒤) |
| `jsonld/context.jsonld` | 계약 JSON → RDF 컨텍스트(속성별 스코프, `kind` → 근거 클래스) |
| `jsonld/types.json` | 경로별 `@type` 규칙과 IRI 규칙(`idRules`). 근거 그래프 서비스가 그대로 읽는다 |
| `jsonld/expected/*.json` | 픽스처를 변환했을 때 반드시 나와야 하는 트리플(`triples`)과 나오면 안 되는 트리플(`absent`) |
| `jsonld/master-ids.json` | 기준 그래프가 반드시 정의하는 id(데이터셋·조항·규칙·가정·에이전트) |
| `rules/integrity.mjs` | 참조 무결성 판정(`refProblems(doc, kind, master, scope)`, `sessionScope`) — 근거 그래프 적재(T-601)가 Python으로 같은 판정을 구현 |
| `rules/claim-lifecycle.mjs` | 문장 상태 전이(`factsTransitionProblems`·`publishProblems`) — 적재·발행이 같은 판정을 쓴다 |
| `fixtures-integrity/sequences/` | 실제 적재 순서(행사 → 유사·평시 → 예보 → 문장 draft → candidate → 발행, 재작성·재검사·위반 포함). 단계마다 계약이 정한 `revisionAfter` |
| `rules/card-projection.mjs` | 숫자 카드 = 예보의 투영(`projectCard`) |
| `rules/sse-sequence.mjs` | SSE 순서 규칙(`sequenceProblems`) — 게이트웨이 스트림 테스트가 그대로 쓴다 |
| `fixtures-sse/` | SSE 이벤트 순서 정상·위반 예시(배열 = 새 예보, `{mode: "followup", forecastId, events}` = 후속 요청) |
| `fixtures/<스키마>/{valid,invalid}-*.json` | 스키마 픽스처(이름이 기대 판정) |
| `fixtures-integrity/<스키마>/` | 스키마는 통과하지만 참조가 끊기거나 같은 id에 다른 내용이 온 문서(적재 거부 대상). `session-scope.json` = 검사할 때 세션에 이미 있다고 보는 문서와 적재 순서 |
| `check/` | Python(jsonschema)·PHP(opis)·JSON-LD(pyld→rdflib) 검사 도구 |
| `generated/` | TS 타입·pydantic 모델(생성물, 손으로 고치지 않는다) |
| `design-tokens.css` | 낮·밤 디자인 토큰 |

- 재생성: `npm -w packages/contracts run gen` / 검사: `npm -w packages/contracts run check`
  - 검사 내용: Ajv strict 컴파일, 픽스처 판정이 TS·Python·PHP 세 언어에서 같고 파일 이름의 기대와 맞는지, 참조 무결성, 정상 픽스처 간 일관성(카드 투영), SSE 순서, JSON-LD 기대·금지 트리플과 형식 오류 리터럴 0개, OpenAPI `$ref`(`#/$defs` 위치까지), SSE 문서가 모든 이벤트를 다루는지
- v1.6(2026-09-25): `timeOfDay`에 `미상` 추가(문체부 개최계획 대부분이 시간대를 적지 않아 일괄 예보·사전 등록 대상이 계약 행사로 바뀌지 못함 — 체크리스트 야간 조명은 `야간`일 때만 켜지는 그대로), 초안 섹션 본문 = 발행 문장 `rendered`를 줄바꿈으로 이은 것(설명 명시), 판정 `basis`(확률|구간, 선택 — 등급은 같고 G0 골드 부족 시 표시만 구간), 초안 `lockedFields.name` = p10|p50|p90|value·`value` = 스냅샷 원래 숫자 + 공백 + 단위(수치 위조 차단)
- 변경 제안은 워커 리포트의 `CONTRACT-CHANGE:`로. 설계: `docs/plan/05` §5, IRI·근거 그래프: `docs/plan/09` §2·§10
