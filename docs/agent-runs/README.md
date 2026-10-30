# Agent run logs

This folder is the audit trail of the Kamboocha agentic pipeline. Every
pipeline task (a feature, a bug fix, a test request) produces a run log here so
you can see **why each agent was called and what it did**.

## What's in here

| File | Written by | Committed? | Purpose |
|---|---|---|---|
| `<date>-<slug>.md` | agents | yes | Human-readable timeline of the run |
| `<date>-<slug>.events.jsonl` | the `run-logger` hook | yes | Deterministic event trail (one JSON per line) |
| `.active` | orchestrator agent | no (git-ignored) | Points to the slug of the run currently in progress |
| `_unassigned.events.jsonl` | the hook | no (git-ignored) | Events captured when no run is active |

The `.md` file is the story; the `.events.jsonl` file is the tamper-resistant
backup, appended automatically by a Claude Code hook
(`.claude/hooks/run-logger.mjs`, wired in `.claude/settings.json`) on every
subagent invocation and session boundary — even if an agent forgets to write
its Markdown entry.

## How it works

1. At intake, the orchestrator (Feature Lead / Bug Lead) creates
   `<date>-<slug>.md` and writes the slug into `.active`.
2. As each phase agent runs, it appends INVOKED / Actions / Gate / Handoff
   blocks to the `.md`, and the hook appends matching events to the `.jsonl`.
3. At close, the orchestrator fills in the Outcome section and clears `.active`.

The full schema and rules live in the `run-logging` skill
(`.github/skills/run-logging/SKILL.md`).

## Reading a jsonl trail quickly

```bash
cat docs/agent-runs/<slug>.events.jsonl | jq -c '{ts, event, kind, agent}'
```
