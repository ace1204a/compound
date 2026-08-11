# Compound

**Read `AGENTS.md` first** — it is the shared brief for every AI agent working in this repo
(architecture, conventions, hard rules, branch policy, deploy steps).

Claude-specific notes:

- Ahmed is non-technical. Explain in plain English; do the technical steps for him.
- He uses this app daily. `main` must always work — verify in the browser preview before
  pushing, and bump `sw.js` VERSION or the fix won't reach his devices.
- Coaching context about Ahmed lives in Claude's memory files, not in this repo.
