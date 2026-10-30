---
name: sdlc-ship
description: "The Kamboocha delivery contract: how any pipeline lane turns validated code into a merged, deployed change — branch naming, commit format, PR creation, the adversarial review loop, the human merge gate (G4), and deploy verification. Used by the Release Manager and referenced by Feature Lead and Bug Lead."
---

# SDLC Ship Contract

Shared delivery procedure for every lane (feature, bug). It begins only after
the change is implemented, local checks pass, and the user has validated the
behavior (G3). It ends when the change is merged and the auto-deploy is
verified. Record each step in the run log (see the `run-logging` skill).

## 1. Branch

- Never commit directly to `main`.
- Branch off the latest `main`:
  - Feature: `feature/<slug>`
  - Bug fix: `bugfix/<slug>`
- `<slug>` matches the run-log slug (minus the date), e.g. `feature/restart-resets-leaderboard`.

## 2. Commit

- Small, coherent commits with imperative subject lines (e.g. `Reset leaderboard on game restart`).
- Reference the run log in the body when useful.
- End every commit message with the attribution line:

  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

- Do not commit secrets, `.env` files, build artifacts, or unrelated changes.

## 3. Push & open the PR

- Push the branch to `origin`.
- Open a PR into `main` via the GitHub MCP, using this description template:

  ```markdown
  ## Summary
  <what changed and why>

  ## Lane
  feature | bug

  ## Validation
  - Local checks: <commands + result>
  - User validation (G3): <what the user confirmed, and where — e.g. Vercel preview URL>

  ## Tests
  <regression tests added by the Test Author>

  ## Run log
  docs/agent-runs/<slug>.md

  ## Deploy
  Auto-deploys on merge: frontend → Vercel, backend → Render.
  ```

- CI (`.github/workflows/ci.yml`) runs automatically on the PR: backend
  `pytest`, frontend lint + build + test.

## 4. Adversarial review loop

- The **PR Reviewer** agent reviews the diff via the GitHub MCP. It must be a
  different agent than the one that wrote the code, and it has read + comment
  access only — it never merges.
- The Implementer addresses review comments; the Reviewer re-reviews.
- Do not proceed to the merge gate until CI is green **and** the Reviewer has
  no outstanding blocking findings.

## 5. Human merge gate (G4)

- Present to the user: the PR link, CI status, the Reviewer's verdict, and a
  one-line recommendation.
- **Wait for the user's explicit approval.** No agent merges on its own
  judgment — the human owns this irreversible step.

## 6. Merge & deploy

- After the user approves, the **Release Manager** executes the merge via the
  GitHub MCP.
- Merging to `main` triggers automatic deploys: **frontend → Vercel**,
  **backend → Render**. The pipeline does not run deploy commands itself.

## 7. Deploy verification (G5, optional)

- After the deploy settles, smoke-check the live services:
  - Backend health: `GET /api/health` on the Render URL should return `{"status": "ok"}`.
  - Frontend: the Vercel URL loads.
- Record the result in the run log's `## Outcome` section.

## Rules

- Merge authority is model **A**: the MCP performs the merge, but only after
  explicit human approval at G4.
- Least privilege: reviewing needs read + comment; merging needs write.
- Leave unrelated worktree changes untouched.
