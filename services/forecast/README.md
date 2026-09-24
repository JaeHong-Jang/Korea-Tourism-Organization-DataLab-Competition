# services/forecast — Python 데이터·모델·판정 서비스 (레인 L1 데이터 · L2 모델·API, Codex gpt-6-astra)

- 스택: Python 3.12(uv), FastAPI, pandas·pyarrow, LightGBM 4.6(고정), scikit-learn, shap, typer
- 역할: 데이터 수집·라벨(L1), 피처·모델·판정·일괄 예보·인사이트·사전 등록 채점·API(L2), 파이프라인 CLI(B 에이전트, L1)
- 설계: `docs/plan/06_데이터_모델_검증.md`, API는 `docs/plan/05_기술_아키텍처.md` §4
- 패키지: `src/crowdcast/{data,labels,pipeline}`(L1) · `src/crowdcast/{features,models,rules,analytics,scoring,api}`(L2)
- 코드 규칙: `AGENTS.md` §5
