# 한국관광공사 데이터랩 활용 경진대회

## 프로젝트 개요
한국관광공사 데이터랩 데이터를 활용한 **행사·축제 인파 사전 예보 서비스 "인파예보(CrowdCast)"**.
계획 문서 안내는 `docs/plan/00_README.md`, AI 워커 계약은 `AGENTS.md`.

## 디렉토리 구조 (레인 소유권은 AGENTS.md §2)
```
├── apps/web/                 # React(Vite) 프론트엔드·3D 미니 대한민국         [L4a·L4b·L4c]
├── services/
│   ├── gateway/              # TypeScript(Hono) 게이트웨이 + 예보팀(Ollama)     [L3]
│   ├── forecast/             # Python(FastAPI) 데이터·모델·판정·날씨            [L1·L2]
│   ├── knowledge/            # Python(FastAPI) 온톨로지·근거 그래프·SHACL        [L6]
│   └── records/              # PHP(Slim) 행사 기록·계획 초안 docx·사전 등록 원장  [L5]
├── packages/contracts/       # 서비스 간 계약(JSON Schema·OpenAPI·SSE·디자인 토큰) [오케스트레이터]
├── configs/                  # 모델·판정 설정(yaml)                            [L2]
├── data/                     # raw/ external/ processed/ cache/ app/ (Git 미포함)
├── models/                   # 학습된 모델 파일 (Git 미포함)
├── notebooks/                # Jupyter 노트북 (사람의 EDA)
├── reports/                  # backtest/ preregistered/ runs/ evals/ figures/ form4/
├── tests/e2e/                # Playwright E2E·스크린샷                          [L4a]
├── scripts/                  # 실행·설정 스크립트(dev·setup·nightly)             [오케스트레이터]
├── .harness/                 # 워커 작업 지시·보고·로그·원장                      [오케스트레이터]
└── docs/                     # plan/ research/ reference/ submission/
```

## 코딩 컨벤션 (상세는 AGENTS.md §5)
- **파일 맨 위에 역할 한 줄 주석, 코드 한 문단(함수·클래스·의미 블록)마다 바로 위에 한국어 한 줄 주석**
- **기능별로 파일을 나눈다**: 한 파일 = 한 책임, 300줄을 넘으면 분리, 라우트 → 서비스 → 저장소 계층 분리
- Python 3.12(uv): snake_case 함수·변수, PascalCase 클래스, ruff / TypeScript: strict, Biome, 파일 kebab-case / PHP 8.5: PSR-12, PHPStan
- 노트북 파일명: `XX_주제_이름.ipynb` (예: `01_eda_jaehong.ipynb`)

## 주요 기술 (상세는 docs/plan/05_기술_아키텍처.md)
- 프론트: React + Vite + TypeScript, Tailwind CSS v4 + shadcn/ui, React Three Fiber(3D), Recharts, React Flow, TanStack Query
- 게이트웨이: Node 22 + Hono, Ollama(로컬 LLM)
- 예측: FastAPI, Polars·DuckDB, Pandera, LightGBM 4.6(고정), MAPIE, shap / 근거 그래프: rdflib·pySHACL·pyoxigraph
- 기록·문서: PHP 8.5 + Slim 4, PDO SQLite, PHPWord
- 실행: 로컬(`npm run dev`), 서버 배포 없음

## 브랜치 규칙
- `main`: 최종 제출용 — 직접 push 금지, PR만 허용
- `develop`: 개발 통합 — PR로만 병합
- 작업 브랜치: `<타입>/<이름>-<설명>` (예: `feat/jaehong-eda`)
- 상세 규칙은 CONTRIBUTING.md 참고

## 커밋 메시지
```
<타입>(<범위>): <설명>
예: feat(analysis): 월별 방문객 추이 분석 추가
```

## 데이터 규칙
- 원본 데이터는 Git에 올리지 않음 (.gitignore 적용됨)
- 데이터 출처와 다운로드 방법은 data/raw/README.md에 기록
- 100MB 이상 파일은 Git에 포함하지 않음

## AI 개발 체계 (오케스트라 하네스)
- 계획 수립 = Claude Code가 직접 작성하고, **Codex(`gpt-6-astra`)를 읽기 전용 교차 리뷰어로 돌린 뒤** 지적을 반영한다. 코드 구현 = 오케스트라 구조.
- Claude Code = 오케스트레이터, Codex(`gpt-6-astra`: L1·L2·L3·L6, `gpt-6-sol`: L4a·L4b·L4c·L5) = 레인별 워커. 역할·레인·워커 규칙·디스패치·게이트는 `AGENTS.md`가 정본이다.
- 일정·작업 목록: `docs/plan/07_일정_작업분해.md`. 오케스트레이터는 계약(`packages/contracts/`)·task 작성·게이트·통합·커밋을 맡고, 레인 구현은 `AGENTS.md` §7 절차로 디스패치한다.
