Run the SESSION START protocol from CLAUDE.md:

1. Read CLAUDE.md, prd.md, gaps.md, and the latest 1–2 logs in `.claude/tasks/done/`.
2. Promote the handoff: copy `.claude/tasks/NextWork.md` over `.claude/tasks/CurrWork.md` (the
   handoff becomes the active task).
   - **Bootstrap exception (first session only):** if the only log in `.claude/tasks/done/` is
     `0000-bootstrap.md`, do NOT promote — `CurrWork.md` already holds the bootstrap-seeded Step 1
     (MFA enforcement). Work that CurrWork as-is. Promotion resumes on the next session.
3. Restate the active task and its acceptance criteria, then wait for my confirmation.

Do not modify application code until I confirm.
