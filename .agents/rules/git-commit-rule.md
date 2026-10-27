# Rule: Commit and Sync with GitHub After Every Task Completion

Whenever a task or milestone is completed:
1. Pull any latest remote changes using `git pull --rebase origin <branch>`.
2. Stage all relevant changes using `git add`.
3. Commit with a clear, concise, descriptive commit message explaining the change (e.g., `feat(auth): implement JWT registration, login, and role-based guards`).
4. Push the commit to GitHub using `git push origin <branch>`.
5. Verify the git status is clean before moving to the next task or waiting for user instructions.
