# packages/contracts — 서비스 간 계약 v1.1 (오케스트레이터 소유, 워커는 읽기 전용)

| 경로 | 내용 |
|---|---|
| `schemas/*.schema.json` | JSON Schema 2020-12 정본 27종. id는 종류 접두사(`e-` `f-` `ev-` `c-` `q-` `obs-` `pr-` `mr-` `s-` `st-` `rule-` `law-` `as-` `ds-` `fa-` `ck-`)를 가진다 |
| `openapi/{forecast,knowledge,records,gateway}.yaml` | 서비스별 OpenAPI 3.1(스키마를 `$ref`로 참조) |
| `sse-events.md` | 게이트웨이 → 웹 SSE 이벤트 순서와 원칙(게이트 A 뒤엔 숫자 카드만, 문장·근거는 발행 뒤) |
| `jsonld/context.jsonld` | 계약 JSON → RDF 컨텍스트(속성별 스코프, `kind` → 근거 클래스) |
| `jsonld/types.json` | 경로별 `@type` 규칙과 IRI 규칙(`idRules`). 근거 그래프 서비스가 그대로 읽는다 |
| `jsonld/expected/*.json` | 픽스처를 변환했을 때 반드시 나와야 하는 트리플 |
| `fixtures/<스키마>/{valid,invalid}-*.json` | 스키마 픽스처(이름이 기대 판정) |
| `fixtures-integrity/<스키마>/` | 스키마는 통과하지만 참조가 끊긴 문서(적재 거부 대상) |
| `check/` | Python(jsonschema)·PHP(opis)·JSON-LD(pyld→rdflib) 검사 도구 |
| `generated/` | TS 타입·pydantic 모델(생성물, 손으로 고치지 않는다) |
| `design-tokens.css` | 낮·밤 디자인 토큰 |

- 재생성: `npm -w packages/contracts run gen` / 검사: `npm -w packages/contracts run check`
  - 검사 내용: Ajv strict 컴파일, 픽스처 판정이 TS·Python·PHP 세 언어에서 같고 파일 이름의 기대와 맞는지, 참조 무결성, JSON-LD 기대 트리플, OpenAPI `$ref`, SSE 문서가 모든 이벤트를 다루는지
- 변경 제안은 워커 리포트의 `CONTRACT-CHANGE:`로. 설계: `docs/plan/05` §5, IRI·근거 그래프: `docs/plan/09` §2·§10
