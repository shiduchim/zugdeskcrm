---
description: Consolidate a long-running project so I can /clear and continue from a clean state
---
Goal: after this I will /clear. Keep everything important; drop clutter. Do NOT change how the app works.
1. /checkpoint first (commit + push).
2. Collect important findings and decisions from this chat, HANDOFF.md and old notes. Put permanent ones in CLAUDE.md (short bullets: architecture, design decisions, "tried and rejected", known gotchas). Put unfinished work in HANDOFF.md.
3. Delete files that are clearly old/unused (old copies, backups, "_old"/"Copy" files, abandoned experiments, outdated notes) without asking. Only ask me about files you're not sure about. Never delete working code or anything the app uses. At the end, list what you deleted (one line each) so I can restore any from Git.
4. Build and run /check to prove the app still works.
5. Commit + push, then tell me: "Safe to /clear. After clearing, type: Continue from HANDOFF.md".
