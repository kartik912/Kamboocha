---
name: run-logging
description: "The Kamboocha pipeline's run-log contract. Every pipeline agent (Feature Lead, Planner, Implementer, Test Author, PR Reviewer, Release Manager, Docs Maintainer, Bug Lead) reads this to record why it was invoked and what it did, so each task has a complete, auditable trail."
---

# Run Logging Contract

Every pipeline task produces one **run log** so you (and future you) can see
*why each agent was called and what it did*. Logging has two layers:

1. **Human-readable timeline** — a Markdown file the agents write.
2. **Deterministic event trail** — a `.events.jsonl` file the `run-logger`
   hook appends to automatically on every subagent invocation and session
   boundary. Agents never write this file; it is the tamper-resistant backup.

## File locations

All logs live in `docs/agent-runs/`:

- `docs/agent-runs/<YYYY-MM-DD>-<slug>.md` — the human timeline (committed).
- `docs/agent-runs/<YYYY-MM-DD>-<slug>.events.jsonl` — the hook trail (committed).
- `docs/agent-runs/.active` — a one-line pointer holding the **slug** of the
  currently active run (local only, git-ignored). The hook reads this to know
  which events file to append to.

`<slug>` is lowercase, hyphen-separated, derived from the request
(e.g. `2026-10-29-restart-resets-leaderboard`). The slug written to `.active`
must equal the file base name (e.g. `2026-10-29-restart-resets-leaderboard`).

## Lifecycle — who does what

**Orchestrator agent (Feature Lead / Bug Lead), at intake:**
1. Choose the slug.
2. Create `docs/agent-runs/<slug>.md` from the template below.
3. Write the slug into `docs/agent-runs/.active`.

**Every agent, on entry — append an INVOKED block:**
```
### [HH:MM] <Agent name> — INVOKED
- Called by: <orchestrator / agent name>
- Why: <one line — the reason this phase ran>
- Inputs: <what was handed over>
```

**Every agent, on exit — append a FINISHED block:**
```
#### Actions
- <what you did, file paths, commands run + result>
#### Gate <Gx>: <APPROVED / CHANGES REQUESTED / BLOCKED> @ [HH:MM]
- <the human's response, verbatim if short>
#### Handoff → <next agent, or "returned to orchestrator">
```
Omit the Gate block when the phase has no human gate.

**Orchestrator, at close:**
1. Fill in the `## Outcome` section.
2. Delete `docs/agent-runs/.active` (or blank it).

## Timeline template

```markdown
# Run: <slug>

- Started: <ISO timestamp>
- Lane: feature | bug | test
- Request: "<original user request, verbatim>"

## Timeline

<!-- agents append INVOKED / Actions / Gate / Handoff blocks here, in order -->

## Outcome

- Branch:
- PR:
- CI:
- Merged: <yes/no> @ <ts>
- Deploy (Vercel + Render):
- Smoke check:
- Status: <done / blocked / abandoned>
- Limitations / follow-ups:
```

## Rules

- Append; never rewrite earlier entries. The log is a chronological record.
- Keep entries factual and specific: real file paths, real commands, real
  results. Do not claim a check passed if it was not run.
- Record every human gate decision, including rejections and the reason.
- The `.events.jsonl` file is written only by the hook — do not edit it.
- If you cannot determine the active slug, still write your Markdown entry to
  the most recent run file and note the ambiguity.
