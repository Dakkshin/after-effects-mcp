# Docs Rules

This folder is for working docs, planning notes, and local guidance.

## Commit Rules

- By default, do not include anything under `docs/` in a Git commit unless the user explicitly asks for docs changes to be committed.
- Before committing, review `git status` and keep the commit scope limited to files directly related to the requested task.
- Do not include temporary helper scripts, generated junk files, or unrelated worktree changes in the same commit.
- Do not commit scratch notes, one-off investigation artifacts, or local-only planning files unless the user explicitly wants them versioned.
- If the worktree contains unrelated changes, leave them untouched and exclude them from the commit.
- If the requested task changes code and docs, prefer code-only unless docs were explicitly part of the task.
- Use clear non-interactive commit messages that describe the actual change.
- Do not amend or rewrite previous commits unless the user explicitly asks.

## Push Rules

- By default, push only commits that are directly related to the requested task.
- Before pushing, review `git status` and `git log --oneline --decorate -n 5` to confirm the outgoing history is intentional.
- Do not push local-only docs, helper scripts, junk files, scratch work, or unrelated worktree changes unless the user explicitly asks.
- Do not assume everything in the working tree should be pushed just because the user asked for a push.
- If `docs/` changes were not explicitly requested for version control, exclude them from the push scope.
- If there are unrelated local commits, mention that before pushing or keep the push limited to the intended branch history.
- Push with a clear understanding of the target remote and current branch.

## Local Docs Note

- Files under `docs/` are local working materials by default.
- Treat them as non-versioned unless the user explicitly asks to commit or push specific docs files.
