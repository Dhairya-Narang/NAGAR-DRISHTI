#!/bin/bash

cd "$(dirname "$0")" || exit 1

# Ensure this is a Git repository
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 1

# Stage project changes
git add -A || exit 1

# Commit only if there are staged changes
if ! git diff --cached --quiet; then
    git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S')" || exit 1
fi

# Push current branch
BRANCH=$(git branch --show-current)
if [ -z "$BRANCH" ]; then
    echo "Error: Git branch nahi mili."
    exit 1
fi

git push origin "$BRANCH"
