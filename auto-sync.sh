#!/bin/bash

cd "$(dirname "$0")" || exit 1

git add -A || exit 1

if ! git diff --cached --quiet; then
    git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S')" || exit 1
fi

BRANCH=$(git branch --show-current)

if [ -z "$BRANCH" ]; then
    echo "Error: Git branch nahi mili."
    exit 1
fi

git push origin "$BRANCH"
