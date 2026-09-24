# AGENTS.md — 인파예보(CrowdCast) 개발 하네스

이 레포에서 일하는 모든 AI 에이전트(Codex 워커, Claude Code 오케스트레이터)의 작업 계약이다.
- 계획 문서 안내: `docs/plan/00_README.md` (제품 `03` · 디자인 `04` · 기술 `05` · 데이터·모델 `06` · 일정·작업 `07` · 서식4 `08`)
- 브랜치·커밋 규칙: `CLAUDE.md`, `CONTRIBUTING.md`
- 이 레포 안에서는 이 파일이 전역 `~/.codex/AGENTS.md`(oh-my-codex)보다 우선한다.

---

## 1. 팀 구조
| 역할 | 누구 | 맡는 일 | 하지 않는 일 |
|---|---|---|---|
| 오케스트레이터 | Claude Code | 계획, 계약(`packages/contracts/`), task 작성·디스패치, 게이트, 통합, 커밋·PR | 레인 구현을 직접 대량으로 하지 않는다(통합 수정·계약·긴급 수정은 예외) |
| 워커 A | Codex `gpt-6-astra` | L1 데이터, L2 모델·API, L3 게이트웨이·예보팀, L6 근거 그래프 | task 범위 밖 수정, git 조작 |
| 워커 S | Codex `gpt-6-sol` | L4a 웹-상담·근거, L4b 웹-대시보드, L4c 3D·펫, L5 기록·문서, 워커 A 결과 교차 리뷰 | 〃 |
| 사람(팀원 4명) | — | 결정, 로그인이 필요한 데이터 확보(데이터랩 CSV·DIY), sudo 설치, 시범 사용자, 서식4·발표, develop 리뷰 | — |
- 계획을 세울 때도 Codex(`gpt-6-astra`)를 **읽기 전용 교차 리뷰어**로 쓴다(작성은 오케스트레이터).
- 웹 안에서 일하는 AI 예보팀(팀장 + 12명)은 제품 기능이다(`docs/plan/10`). 이 개발 하네스와 헷갈리지 않는다.

## 2. 레인과 파일 소유권
| 레인 | 소스 경로(git) | 실행 산출물(git 제외) | 워커 | 레인 브랜치 |
|---|---|---|---|---|
| L1 데이터 | `services/forecast/src/crowdcast/{data,labels,pipeline}/` + 같은 이름의 `tests/` 하위 | `data/processed/` `data/cache/` `reports/runs/` | A | `feat/astra-forecast-data` |
| L2 모델·API | `services/forecast/src/crowdcast/{features,models,rules,analytics,scoring,api}/` + 같은 이름의 `tests/` 하위, `configs/` | `models/` `reports/backtest/` `reports/preregistered/` | A | `feat/astra-forecast-model` |
| L3 게이트웨이·예보팀 | `services/gateway/` | `traces/` `data/app/gateway.sqlite` `reports/evals/` | A | `feat/astra-gateway` |
| L6 근거 그래프 | `services/knowledge/` (패키지 설정 제외) | `data/app/knowledge/` | A | `feat/astra-knowledge` |
| L4a 웹-상담·근거 | `apps/web/src/{app,lib,styles}/`, `components/{ui,charts,common}/`, `features/{consult-chat,team-board,forecast-report,evidence,safety-plan,my-events}/`, `pages/`의 S2~S5, `apps/web/package.json`, `tests/e2e/` | `apps/web/dist/` `reports/figures/screens/` | S | `feat/sol-web-consult` |
| L4b 웹-대시보드 | `features/{festival-list,kpi-timeline,validation,insights,ops,map-2d}/`, `pages/`의 S6~S8 | — | S | `feat/sol-web-dashboard` |
| L4c 3D·펫 | `components/{scene,pets}/`, `features/{mini-korea,venue-diorama,sky-weather}/`, `pages/`의 S1 | — | S | `feat/sol-web-3d` |
| L5 기록·문서 | `services/records/` | `data/app/records.sqlite` | S | `feat/sol-records` |
| 공용(오케스트레이터) | `packages/contracts/` `scripts/` `docs/` `.harness/` 루트 파일(`package.json` `.gitignore` `.env.example` `AGENTS.md` `CLAUDE.md`), Python 공용 파일(uv 워크스페이스 `pyproject.toml`·`uv.lock`, 서비스별 `pyproject.toml`, `tests/conftest.py`, 패키지 `__init__.py`) | — | Claude | 통합 브랜치 = `develop`(백업 push) |

- 한 레인에는 한 번에 워커 하나만 둔다. 레인 안의 task는 직렬로 돈다. 레인끼리는 **계약(`packages/contracts/`)으로만** 소통한다.
- 다른 레인의 기능이 아직 없으면 계약의 픽스처(`packages/contracts/fixtures/`)로 먼저 만들고, 실제 연결은 통합 단계에서 한다.
- `reports/backtest/*.json`, `reports/preregistered/*.csv`는 작은 공개 산출물이라 git으로 추적한다. 나머지 실행 산출물(`data/` `models/` `traces/` `reports/{runs,evals,figures/screens}/`)은 §7-1의 공유 링크로 본 레포에 바로 쌓인다.
- 웹 레인 셋은 L4a가 만든 앱 셸·UI 키트·`package.json`·공용 선택 스토어를 공유한다. 공용 부품이나 의존성이 필요하면 리포트에 요청하고 L4a task로 처리한다.

---

## 3. 워커 규칙 (Codex는 반드시 지킨다)
1. 받은 task 파일(`.harness/tasks/T-###.md`) **하나만** 수행한다. task의 "허용 경로" 밖 파일은 만들거나 고치지 않는다.
2. `packages/contracts/`는 읽기 전용이다. 계약이 틀렸거나 부족하면 고치지 말고 리포트에 `CONTRACT-CHANGE:`로 제안한다.
3. git은 읽기만 한다(`status`·`diff`·`log`). 커밋·푸시·태그·브랜치 전환·rebase·merge·stash를 하지 않는다. 변경은 작업 트리에 남긴다.
4. 의존성은 task에 적힌 경우에만 추가하고, 추가했으면 리포트에 패키지·버전·이유를 적는다.
5. 비밀: 키는 `.env`에서만 읽는다. 출력·로그·테스트 픽스처·리포트에 키를 남기지 않는다.
6. 외부 호출: data.go.kr 키는 팀 전체가 **일 1,000건**을 공유한다. task가 허용한 호출 수 안에서만 호출하고 응답은 캐시에 저장한다. **데이터랩 웹 스크래핑 금지**(이용약관).
7. `data/raw/`는 읽기만 한다. 데이터 파일과 100MB 이상 파일은 git 대상이 아니다.
8. **숫자·근거 불변식**: 예측·판정 수치는 forecast 서비스의 결정적 코드만 만든다. LLM 문장에는 숫자 자리표시자만 쓴다. forecast 응답은 결과마다 근거 조각(`evidence[]`)을 함께 준다. 화면·문서에 나가는 문장은 근거 그래프의 근거를 하나 이상 가리켜야 하고, SHACL 검증을 통과한 것만 발행한다(`docs/plan/09`). 추정치에는 `estimated` 필드나 "추정" 표기를 붙인다.
9. **누수 금지**: 학습 피처는 `available_at ≤ as_of(개최 D-14)`인 값만 쓴다.
10. 이 레포 task에서는 omx `team`·`ralph`·`autopilot` 같은 장기 실행 모드를 켜지 않는다. 네이티브 서브에이전트는 task 범위 안의 조사에만 쓴다.
11. 막히면 추측으로 구현하지 말고 멈춘 뒤 리포트에 `BLOCKED:`와 필요한 결정·정보를 적는다.
12. 끝내기 전에 task의 **수용 기준 명령을 직접 실행**하고 결과를 리포트에 붙인다. 실패를 성공으로 적지 않는다.

## 4. 리포트 형식 (워커 → 오케스트레이터)
마지막 메시지를 아래 형식으로 끝낸다. 이 메시지는 `-o` 옵션으로 `.harness/reports/T-###.md`에 저장된다.
```
## T-### 결과: DONE | PARTIAL | BLOCKED
- 변경 파일: <경로 목록>
- 수용 기준: <명령> → <결과 요약. 실패 시 에러 원문 일부>
- 의존성 변경: 없음 | <패키지==버전: 이유>
- CONTRACT-CHANGE: 없음 | <제안>
- BLOCKED: 없음 | <필요한 결정·정보>
- 남은 일·주의: <있으면>
```

---

## 5. 코드 작성 규칙 (모든 언어 공통, 반드시 지킨다)

### 5-1. 주석 — 파일 한 줄, 문단마다 한 줄
- **파일 맨 위**: 이 파일이 무엇을 하는지 한국어 한 줄.
- **코드 한 문단마다**(함수·클래스·메서드, 그리고 함수 안에서 빈 줄로 나뉘는 의미 있는 블록마다) **바로 위에 한국어 한 줄 주석**으로 "무엇을/왜"를 적는다.
- 한 줄로 충분하게 쓴다. 코드를 그대로 번역한 주석("i를 1 증가")은 쓰지 않는다. 자명한 한 줄짜리 코드에는 문단 주석을 따로 달지 않는다.
- 예시(TypeScript):
  ```ts
  // 행사 설명 문장에서 스키마에 맞는 행사 초안을 추출한다
  export async function extractEvent(text: string, today: string): Promise<EventDraft> {
    // 로컬 LLM에 JSON 스키마를 강제해 필드만 받아온다
    const raw = await ollama.chat({ model: MODEL_FAST, format: eventDraftSchema, messages: buildMessages(text, today) });

    // 스키마 검증에 실패하면 빈 초안으로 되돌려 폼 입력으로 넘긴다
    const parsed = validateEventDraft(raw.message.content);
    return parsed.ok ? parsed.value : emptyDraft();
  }
  ```
- 예시(Python): 모듈 맨 위 `"""파일 역할 한 줄"""`, 함수마다 위에 `# 한 줄`. PHP: 파일 맨 위 `// 역할 한 줄`, 메서드마다 위에 `// 한 줄`.

### 5-2. 파일 분리 — 기능별로 나눈다
- **한 파일 = 한 책임.** 라우트 하나, 도구(클라이언트) 하나, 에이전트 단계 하나, 의도 하나, 초안 섹션 하나, 인사이트 지표 하나, 컴포넌트 하나가 각각 파일 하나다.
- **기능별 폴더**: 웹은 `src/features/<기능>/{components,hooks,api.ts,types.ts,index.ts}`, gateway는 `src/team/{lead,analysis,verification,report,runtime}/`(팀원 하나 = 파일 하나), knowledge는 `src/knowledge/<기능>/`, forecast는 `src/crowdcast/<도메인>/`, records는 `src/<도메인>/{Controller,Repository,Service}.php`.
- **계층을 섞지 않는다**: 라우트/컨트롤러(입출력·검증) → 서비스(로직) → 저장소·클라이언트(DB·외부 호출).
- 파일이 **300줄**을 넘으면 나눈다. 두 곳 이상에서 쓰는 코드만 공용(`lib/`, `Support/`, `common`)으로 올린다.
- 파일 이름: TS는 kebab-case(`festival-card.tsx`, 컴포넌트 export는 PascalCase), Python은 snake_case, PHP는 PascalCase 클래스 파일. 온톨로지는 shapes·queries도 규칙 하나·질의 하나당 파일 하나(`services/knowledge/ontology/{shapes,queries}/`).

### 5-3. 언어별
- **Python**(forecast·knowledge): 3.12(uv), 타입 힌트, pydantic v2, ruff. 표 처리는 Polars·DuckDB, 표 검증은 Pandera. 테스트는 pytest이고 네트워크 없이 녹화 픽스처로 돈다.
- **TypeScript**(web·gateway): strict, Biome. 스키마 검증은 계약에서 생성한 타입 + Ajv. 웹은 색·간격에 `design-tokens.css`의 토큰만 쓰고(하드코딩 금지), 화면 숫자는 API JSON을 그대로 표시한다.
- **PHP**(records): 8.5(Ubuntu 26.04 apt 기본), `declare(strict_types=1);`, PSR-12, PHPStan, PHPUnit. 요청·응답은 opis/json-schema로 계약 검증.
- **LLM 호출은 두 곳만**: gateway `src/llm/ollama-client.ts`(모델·타임아웃은 `config.ts`)와 forecast `src/crowdcast/pipeline/summary.py`(B 에이전트 실행 요약). 모든 LLM 출력은 스키마 검증 또는 숫자·근거 가드를 통과해야 쓴다. LLM이 실패해도 결과가 나오도록 템플릿 대체 경로를 둔다.
- **3D**(L4c): React Three Fiber. 인형·차량은 인스턴싱, 매 프레임 할당 금지, 품질 단계와 `prefers-reduced-motion`을 지킨다. 장면에는 "인원은 예보 비례 · 움직임은 연출" 표시를 지우지 않는다.

### 5-4. 공통
- 개인정보를 저장하지 않는다(행사 정보만). 면책 문구("참고용 — 담당자 검토 필수", "추정 산식 기반")를 지우지 않는다.
- 모든 화면 컴포넌트에 로딩·빈 값·오류 상태를 둔다.

### 5-5. 사람이 만든 것처럼
- 이름은 도메인 말로 짓는다(`festival`, `venue`, `crowd`, `judgment`, `evidence`). `utils`·`helpers`·`manager`·`handler`·`data2`처럼 뭉뚱그린 이름을 쓰지 않는다.
- 쓰지 않는 추상화·옵션·설정·인터페이스를 미리 만들지 않는다. 두 번째로 필요해질 때 만든다.
- 주석은 §5-1대로 한 줄. "이 함수는 ~를 수행합니다" 같은 번역투, 코드를 되풀이하는 주석, 장황한 docstring을 쓰지 않는다.
- README·문서·UI 문구에 이모지 제목, "강력한·혁신적인·원활한" 같은 홍보 말투, "AI가 분석했어요" 같은 표현을 쓰지 않는다. 화면 문구는 예보팀의 말투(`docs/plan/04` §11).
- 예시·픽스처 데이터는 실제 한국 행사·지명·날짜로 만든다("Festival A", Lorem ipsum 금지).
- 커밋 메시지는 팀 규칙(`<타입>(<범위>): <설명>`)의 한국어 평서문.

---

## 6. Task 파일 템플릿 (오케스트레이터가 작성)
```markdown
# T-###: <제목>
- 레인/워커: L1 / gpt-6-astra        - 선행: T-### (완료)
- 목표(한 문장):
- 읽을 것: docs/plan/0x_… §x, packages/contracts/<파일>
- 허용 경로: <여기 밖은 수정 금지>
- 인터페이스: <입력> → <출력> (계약 링크)
- 수용 기준(실행 명령): `uv run pytest services/forecast/tests/... -q` 통과, …
- 범위 밖: <하지 말 것>
- 외부 호출: 없음 | data.go.kr ≤ N건 | 패키지 설치 허용(목록)
- 코드 규칙: AGENTS.md §5 (파일·문단 주석, 기능별 파일 분리)
```

## 7. 오케스트레이터 절차 (Claude Code)
> 9/24 확인: WSL `codex-cli 0.156.1`에서 `gpt-6-astra`·`gpt-6-sol` 모두 `codex exec`로 응답했다. `-s read-only -C <repo> -o <파일>` 실행이 레포 `AGENTS.md`를 읽고 규칙을 인용했으며, 샌드박스 밖 경로에 `-o` 결과가 저장됐다. `workspace-write`·네트워크 옵션·`--json` 로그는 첫 실제 task에서 확인한다.

### 7-0. 구현 그래프
- 모든 task·검토·게이트는 `.harness/graph.json`의 노드다(`docs/plan/12_구현_그래프.md`). 디스패치 전 `graph.mjs start`, 게이트 통과 후 `graph.mjs done --evidence`, 검토 불합격은 `graph.mjs fail R-xx --to <노드>`로 되돌리고, `stale`이 된 노드는 수용 기준을 다시 돌려 확인한다.
- 디스패치 순서는 `graph.mjs ready`가 정한다. 레인 잠금과 동시 워커 수(3~4)는 그대로 지킨다.

### 7-1. 준비 (T-000에서 한 번)
- 레인 워크트리는 WSL 홈에 둔다(`/mnt/c`에서는 npm·git이 느리다).
  `git worktree add ~/crowdcast-wt/L1 -b feat/astra-forecast-data develop`
- git 밖 산출물은 본 레포 한 곳에 둔다. `traces/` `reports/runs/` `reports/evals/` `reports/figures/screens/` `reports/figures/perf/` `.env`는 워크트리에 심볼릭 링크로 공유하고, **`data/`·`models/`는 링크하지 않고 `CROWDCAST_DATA_ROOT`(본 레포 경로, `.env`)로 연다** — Python은 `crowdcast.paths`·`knowledge.paths`, PHP·TS는 환경 변수를 직접 읽는다. 워크트리 안의 `data/`에는 원본이 없다.
- 서비스 기동 확인은 **자기 서비스만** 띄운다: `node scripts/dev.mjs --check --only <forecast|knowledge|records|gateway|web>`(여러 레인 워커가 동시에 돌 때 포트 8010·8020·8030·8787·5173이 부딪히지 않게). 실패하면 종료 코드 1.
- 워커 샌드박스(`dispatch.sh`)는 본 레포의 `data/processed` `data/cache` `data/app` `models` `traces` `reports/runs` `reports/evals` `reports/figures/screens` `reports/figures/perf`만 쓰기로 연다(`--add-dir`). 원본(`data/20*_festival` `data/raw` `data/external`)은 읽기만 한다. 공유 산출물을 바꾼 task는 리포트와 LEDGER에 파일 해시(`sha256sum`)를 남긴다.
- 레인 잠금: 디스패치 전에 `.harness/locks/<레인>`을 만들고 끝나면 지운다. 잠금 파일이 있으면 그 레인에 새 task를 보내지 않는다.

### 7-2. 디스패치
Claude는 Bash `run_in_background`로 실행하고 완료 알림을 기다린다(폴링 금지). 동시 워커는 3개(사용 한도를 보며 4개까지).
```bash
REPO="/mnt/c/Users/User/Desktop/대학교/3학년/한국관광공사 데이터랩 활용 경진대회"
T=T-101; WT=~/crowdcast-wt/L1; MODEL=gpt-6-astra      # L4a·L4b·L4c·L5는 gpt-6-sol
timeout 3600 codex exec -m "$MODEL" -s workspace-write -C "$WT" --json --add-dir "$REPO/data/processed" … \   # 실제로는 scripts/harness/dispatch.sh
  -o "$REPO/.harness/reports/$T.md" - < "$REPO/.harness/tasks/$T.md" \
  > "$REPO/.harness/logs/$T.jsonl" 2>&1
echo $? > "$REPO/.harness/logs/$T.exit"
```
- 네트워크(패키지 설치·API)가 필요한 task에만 `-c sandbox_workspace_write.network_access=true`를 붙인다.
- **프롬프트를 인자로 주는 `codex exec`(검토 등)는 반드시 `< /dev/null`로 stdin을 닫는다.** 안 닫으면 stdin을 기다리다 시간 초과된다(9/24 R-01 1차 실행에서 발생). 실행 중인 로그 파일은 옮기지 않는다.
- 완료 판정은 네 가지를 **따로** 확인한다: ① 종료 코드 0(124는 시간 초과) ② 리포트 첫 줄 `DONE` ③ 게이트 2 통과 ④ 게이트 3 통과. `-o` 리포트는 워커의 마지막 말일 뿐 통과 증명이 아니다.

### 7-3. 게이트 (순서대로. 실패하면 피드백을 task 파일 끝에 붙여 재디스패치, 최대 2회. 그래도 실패하면 Claude가 직접 고치거나 범위를 줄인다)
1. **허용 경로·산출물**: `git -C "$WT" status --porcelain --ignored`의 모든 경로가 task 허용 경로 또는 해당 레인의 실행 산출물 경로 안에 있는가. task가 만든다고 한 산출물이 **본 레포 경로**에 실제로 있고 해시가 기록됐는가.
2. **수용 기준 재실행**: 오케스트레이터가 워크트리에서 task의 명령을 직접 실행한다.
3. **교차 리뷰**: 다른 모델로 읽기 전용 리뷰(A 작업은 `gpt-6-sol`, S 작업은 `gpt-6-astra`).
   ```bash
   # add -N: 새로 만든(untracked) 파일 내용도 diff에 나오게 한다
   git -C "$WT" add -N . && git -C "$WT" diff | timeout 1200 codex exec -m gpt-6-sol -s read-only -C "$WT" \
     -o "$REPO/.harness/reports/$T.review.md" \
     "stdin의 diff를 $REPO/.harness/tasks/$T.md 와 AGENTS.md(특히 §5 코드 규칙) 기준으로 리뷰하라. 파일 수정 금지. [High/Med/Low] 위치 — 문제 — 수정안 형식, 없으면 'LGTM'."
   ```
   High가 하나라도 있으면 반려한다.
4. **Claude 리뷰**: 계약 준수, 숫자·누수 불변식, §5 주석·파일 분리 규칙, 불필요한 복잡도. 화면 task는 스크린샷을 직접 보고 판단한다.

### 7-4. 통합과 기록
- 게이트를 통과하면 레인 브랜치에 커밋(`<타입>(<범위>): <설명>` + Co-Authored-By) → `develop`에 병합 → 깨끗한 상태에서 `npm test` 재실행 → **검토·게이트 노드를 통과할 때마다 `origin/develop`에 push**(백업, 사용자 결정 2026-09-24). `main`은 제출 직전에 PR로만 반영한다.
- **기록**: `.harness/LEDGER.md`에 task마다 한 줄: `T-### | 워커 모델 | 상태 | 종료코드 | 게이트 1~4 | 리뷰 모델·결론 | 커밋 해시 | 산출물 해시`.
- 태그·공개 게시(사전 등록 등)는 오케스트레이터만 한다.
