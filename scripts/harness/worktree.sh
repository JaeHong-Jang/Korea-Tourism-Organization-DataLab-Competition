#!/usr/bin/env bash
# 레인 워크트리를 WSL 홈에 만들고, git 밖 공유 산출물(traces·reports 일부·.env)을 본 레포로 링크한다
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LANE="${1:?사용법: worktree.sh <레인> <브랜치>}"
BRANCH="${2:?브랜치 이름이 필요하다}"
WT="$HOME/crowdcast-wt/$LANE"

# 이미 있으면 develop 최신으로 맞춘다(레인 브랜치에 develop 병합)
if [ -d "$WT" ]; then
  git -C "$WT" merge --no-edit develop >/dev/null
  echo "· 이미 있음: $WT (develop 병합)"
else
  mkdir -p "$HOME/crowdcast-wt"
  git -C "$REPO" worktree add -b "$BRANCH" "$WT" develop >/dev/null 2>&1 || git -C "$REPO" worktree add "$WT" "$BRANCH" >/dev/null
  echo "✓ 워크트리: $WT ($BRANCH)"
fi

# git이 추적하지 않는 공유 산출물만 링크한다(추적 파일이 있는 data/·models/는 링크하지 않고 CROWDCAST_DATA_ROOT로 본 레포를 가리킨다)
for rel in traces reports/runs reports/evals reports/backtest reports/figures/screens reports/figures/perf .env; do
  [ "$rel" = ".env" ] || mkdir -p "$REPO/$rel"
  target="$WT/$rel"
  mkdir -p "$(dirname "$target")"
  if [ ! -e "$target" ] || [ -L "$target" ]; then ln -sfn "$REPO/$rel" "$target"; fi
done
# 웹이 읽는 시군구 경계(git 제외 자산)를 워크트리의 public/geo로 링크한다
mkdir -p "$WT/apps/web/public/geo"
ln -sfn "$REPO/data/external/boundaries/sigungu.topo.json" "$WT/apps/web/public/geo/sigungu.topo.json"
echo "✓ 공유 산출물 링크 완료 (data·models는 CROWDCAST_DATA_ROOT=$REPO)"
