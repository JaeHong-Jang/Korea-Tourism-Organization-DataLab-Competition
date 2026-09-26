# services/knowledge — 온톨로지·근거 그래프 서비스 (레인 L6, Codex gpt-6-astra)

- 스택: Python 3.12(uv), FastAPI, rdflib, pySHACL, pyoxigraph(설치형 RDF 저장소·SPARQL)
- 역할: 온톨로지·기준 그래프, 예보 세션 그래프, SHACL 검증(S01~S12), SPARQL 질의, 근거 통계
- 설계: `docs/plan/09_온톨로지_근거그래프.md`
- 폴더: `ontology/{crowdcast.ttl,master/,shapes/,queries/}` `src/knowledge/{api,store,validate,query,stats}/` `tests/`
- 코드 규칙: `AGENTS.md` §5 (shapes·queries도 규칙 하나·질의 하나당 파일 하나)
