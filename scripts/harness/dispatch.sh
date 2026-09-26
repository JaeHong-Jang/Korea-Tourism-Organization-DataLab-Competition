#!/usr/bin/env bash
# task 하나를 Codex 워커에게 보낸다 — 레인 잠금, 시간 제한, 로그(--json), 종료 코드, 리포트(-o)를 남긴다
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TASK="${1:?사용법: dispatch.sh <T-###> <레인> <모델> [--net]}"
LANE="${2:?레인이 필요하다}"
MODEL="${3:?모델이 필요하다(gpt-6-astra | gpt-6-sol)}"
NET="${4:-}"
WT="$HOME/crowdcast-wt/$LANE"
LOCK="$REPO/.harness/locks/$LANE"
mkdir -p "$REPO/.harness/locks" "$REPO/.harness/logs" "$REPO/.harness/reports"

# 레인에 이미 워커가 있으면 보내지 않는다
if [ -e "$LOCK" ]; then echo "✗ 레인 $LANE 잠김: $(cat "$LOCK")"; exit 2; fi
[ -f "$REPO/.harness/tasks/$TASK.md" ] || { echo "✗ task 파일 없음"; exit 2; }
[ -d "$WT" ] || { echo "✗ 워크트리 없음: $WT (worktree.sh 먼저)"; exit 2; }
echo "$TASK $MODEL $(date -Iseconds)" > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# 네트워크가 필요한 task(패키지 설치·API)만 샌드박스 네트워크를 연다
EXTRA=()
[ "$NET" = "--net" ] && EXTRA=(-c sandbox_workspace_write.network_access=true)

# 본 레포의 공유 산출물 폴더만 쓰기로 연다(원본 데이터 data/20*·data/raw·data/external은 읽기 전용으로 남는다)
for rel in data/processed data/cache data/app models traces reports/runs reports/evals reports/backtest reports/figures/screens reports/figures/perf; do
  mkdir -p "$REPO/$rel"
  EXTRA+=(--add-dir "$REPO/$rel")
done

# 워커 실행: 마지막 메시지는 리포트로, 이벤트는 jsonl 로그로
timeout 5400 codex exec -m "$MODEL" -s workspace-write -C "$WT" --json "${EXTRA[@]}" \
  -o "$REPO/.harness/reports/$TASK.md" - < "$REPO/.harness/tasks/$TASK.md" \
  > "$REPO/.harness/logs/$TASK.jsonl" 2>&1
CODE=$?
echo "$CODE" > "$REPO/.harness/logs/$TASK.exit"
echo "$TASK 종료 코드 $CODE (124 = 시간 초과) — 리포트 .harness/reports/$TASK.md"
exit "$CODE"
