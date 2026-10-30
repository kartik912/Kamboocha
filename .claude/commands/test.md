---
description: Add focused regression/coverage tests to Kamboocha (standalone test lane)
argument-hint: <what to cover, or a feature-skill path + validated behavior>
---

Run the standalone **test** lane for the request below by delegating to the test-author subagent.

Request: $ARGUMENTS

Steps:
1. Start a run log for this task: read `.github/skills/run-logging/SKILL.md`, create `docs/agent-runs/<YYYY-MM-DD>-<slug>.md` (lane: `test`), and write the slug into `docs/agent-runs/.active`.
2. **Task(subagent_type: `feature-test-author`)** with the request and the run-log path. It inspects conventions, designs and writes focused tests, and runs the narrowest relevant test command.
3. If it returns a question or reports a product defect (it must not weaken assertions to pass), relay it to the user and iterate.
4. Close the run log `## Outcome`, clear `.active`, and report the test files changed, behaviors covered, and commands/results.
