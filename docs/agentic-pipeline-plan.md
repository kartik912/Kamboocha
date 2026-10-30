# Kamboocha Agentic Pipeline — Plan

The reference design for Kamboocha's multi-agent SDLC pipeline. Built in phases;
Phase 1 is implemented, Phases 2–5 follow.

## Goals

- A professional agentic pipeline with distinct lanes: **feature**, **bug**, **test**.
- The feature lane is a **full SDLC**: plan → implement → test → review → merge → deploy.
- **Human-in-the-loop** gates at the decisions that matter.
- **Auditable logging**: every run records why each agent ran and what it did.

## Runtime & billing

The pipeline runs through the `codemie-claude` command, which launches **Claude
Code** with model calls routed via a local proxy to EPAM's CodeMie endpoint — so
usage is company-billed, not personal. The GitHub MCP is a tool server and
consumes no model tokens of its own.

## File layout (Claude Code native)

The runtime is Claude Code, which reads `.claude/`, not `.github/agents/`. So:

- **Orchestrators are slash commands** in `.claude/commands/` (`/feature`, `/test`,
  and `/bug` in Phase 3). They run in the main conversation, so they can talk to
  the user and own the human gates.
- **Workers are subagents** in `.claude/agents/` (`planner`, `implementer`,
  `feature-test-author`, `readme-maintainer`, `release-manager`), spawned via the
  Task tool. They cannot talk to the user.
- **Contracts and feature skills** live in `.github/skills/` and are read by path
  (they do not need to be auto-loaded).

## Lanes and agents

Explicit lanes (you pick the door): `/feature`, `/bug`, `/test`.

| SDLC phase | Agent | Owns | Gate |
|---|---|---|---|
| Orchestration | **Feature Lead** | sequences phases, enforces gates, owns run log | — |
| Requirements & Design | **Planner** | discovery Q&A, the plan, the feature skill | G1, G2 |
| Development | **Implementer** | branch + write code + local checks | — |
| Testing | **Test Author** | regression / coverage tests | — |
| Code Review / QA | **PR Reviewer** | adversarial diff review via MCP (read + comment only) | — |
| Release & Deploy | **Release Manager** | open PR, run review loop, execute merge after G4, verify deploy | G3, G4, G5 |
| Docs (cross-cutting) | **Docs Maintainer** | README sync | — |

The **Bug Lead** fronts the bug lane (reproduce + root-cause + triage), then
reuses Implementer → Test Author → PR Reviewer → Release Manager → Docs.

Structural rules: the plan-approval gate (G2) sits between Planner and
Implementer; the PR Reviewer is independent of the Implementer; the Release
Manager (not the Implementer) holds merge authority and only after human
approval.

## Human gates

| Gate | When | Human action |
|---|---|---|
| G1 | after discovery (feature) / diagnosis (bug) | answer / confirm scope |
| G2 | after plan, before any code | approve the plan |
| G3 | after implement + checks | validate on Vercel preview / locally |
| G4 | after Reviewer + green CI | approve the merge (MCP executes it) |
| G5 | post-merge (auto-deploy done) | optional smoke check |

## Feature lane flow

```
Feature Lead (opens run log)
  → Planner      — discovery [G1] → plan + feature skill [G2]
  → Implementer  — branch feature/<slug> → code → local checks
  → (validate on Vercel preview) [G3]
  → Test Author  — regression tests
  → Docs Maintainer — README
  → Release Manager — push → open PR
        → PR Reviewer (MCP) — review → Implementer addresses → re-review
        → [G4: approve] → Release Manager merges via MCP
        → auto-deploy (Vercel + Render) → smoke-check /api/health [G5]
  → Feature Lead closes run log → report
```

## Observability

- Per-run human timeline: `docs/agent-runs/<date>-<slug>.md`.
- Per-run deterministic trail: `docs/agent-runs/<date>-<slug>.events.jsonl`,
  appended by the `run-logger` hook on every subagent invocation.
- Contract: `.github/skills/run-logging/SKILL.md`.

## Infrastructure decisions (settled)

- **Merge authority:** model A — MCP performs the merge after explicit human approval.
- **GitHub access:** hosted GitHub MCP, registered via `codemie mcp add` (fine-grained PAT, repo-scoped: Contents r/w, Pull requests r/w).
- **CI:** GitHub Actions on PRs — backend `pytest`, frontend lint + build + test.
- **Deploy:** automatic on merge to `main` — frontend → Vercel, backend → Render.
- **Logging:** deterministic via Claude Code hooks + agent-written Markdown.

## Build phases

- **Phase 1 — Foundations (done):** logging hook + run-log scaffold, CI
  workflow, `run-logging` and `sdlc-ship` contracts.
- **Phase 2 — SDLC phase agents (done):** `/feature` slash command orchestrates
  `planner` + `implementer` + `feature-test-author` + `readme-maintainer` +
  `release-manager` subagents; `/test` standalone lane added. (Built as Claude
  Code `.claude/commands` + `.claude/agents`.)
- **Phase 3 — Bug Lead (done):** `/bug` slash command orchestrates `bug-lead`
  (reproduce + root-cause + triage + bug skill) → `feature-test-author` → `implementer`
  → `readme-maintainer` → `release-manager`, reusing the Phase 2 workers. The bug
  lane is **failing-test-first**: the Test Author writes a reproducing test shown
  red (gate G2 approved) before the Implementer makes it green. Decisions:
  red→green discipline (chosen over repro-notes-only); a dedicated `bug-lead`
  subagent (chosen over inline orchestrator diagnosis). Bug branch: `bugfix/<slug>`.
- **Phase 4 — PR Reviewer + GitHub MCP (done):** `pr-reviewer` subagent reviews PRs
  read + comment only. `release-manager` opens, updates, and merges PRs via the GitHub
  MCP (`create_pull_request`, `pull_request_read`, `merge_pull_request`). Review loop
  (max 3 rounds) lives in the orchestrators: reviewer → implementer (review-fix mode) →
  release-manager (update) → reviewer. The GitHub MCP is registered at local scope with
  a fine-grained, repo-scoped PAT; the token is kept in the user's Claude config, not the repo.
- **Phase 5 — End-to-end dry run.**

## Phase 1 — files created

- `.claude/hooks/run-logger.mjs` — deterministic event logger hook.
- `.claude/settings.json` — wires the hook to SessionStart/End, SubagentStop,
  and Pre/PostToolUse on the agent tool.
- `.github/workflows/ci.yml` — backend + frontend CI on PRs to main.
- `.github/skills/run-logging/SKILL.md` — the logging contract.
- `.github/skills/sdlc-ship/SKILL.md` — the delivery contract.
- `docs/agent-runs/` — run-log home (README, .gitignore).

## Phase 3 — files created / changed

- `.claude/commands/bug.md` — the `/bug` Bug Lead orchestrator (failing-test-first flow).
- `.claude/agents/bug-lead.md` — new diagnosis subagent (reproduce + root-cause + triage + author the bug skill).
- `.claude/agents/feature-test-author.md` — added **bug repro mode** (write a reproducing test shown red before the fix exists).
- `.claude/agents/implementer.md` — generalized to serve both lanes (`feature/<slug>` and `bugfix/<slug>`; preserve + green the repro test).
- The Bug Lead reuses `readme-maintainer` and `release-manager` unchanged (both were already written lane-agnostic).
