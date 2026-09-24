#!/usr/bin/env bash
# 레인 워크트리를 WSL 홈에 만들고, git 밖 공유 산출물(data·models·traces·reports 일부·.env)을 본 레포로 링크한다
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

# 공유 산출물은 본 레포 한 곳에 두고 링크한다(워크트리마다 복사하지 않는다)
for rel in data models traces reports/runs reports/evals reports/figures/screens reports/figures/perf .env; do
  mkdir -p "$REPO/$(dirname "$rel")"
  [ "$rel" = ".env" ] || mkdir -p "$REPO/$rel"
  target="$WT/$rel"
  if [ ! -e "$target" ] || [ -L "$target" ]; then
    mkdir -p "$(dirname "$target")"
    ln -sfn "$REPO/$rel" "$target"
  elif [ -d "$target" ] && [ -z "$(ls -A "$target" 2>/dev/null | grep -v .gitkeep)" ]; then
    rm -rf "$target" && ln -sfn "$REPO/$rel" "$target"
  fi
done
echo "✓ 공유 산출물 링크 완료"
