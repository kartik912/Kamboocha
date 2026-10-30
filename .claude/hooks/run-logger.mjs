#!/usr/bin/env node
/*
 * Deterministic run-logger hook for the Kamboocha agentic pipeline.
 *
 * Invoked by Claude Code hooks (see ../settings.json). Reads the hook event
 * JSON from stdin and appends a machine-readable event line to the active
 * run's events file: docs/agent-runs/<slug>.events.jsonl
 *
 * The "active run" is whatever slug is written in docs/agent-runs/.active
 * (an orchestrator agent sets this at intake). When no run is active, events
 * fall back to docs/agent-runs/_unassigned.events.jsonl (git-ignored).
 *
 * Design rule: this hook must NEVER block or crash a session. Any error is
 * swallowed and the process exits 0.
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

function main() {
  // This script lives at <project>/.claude/hooks/run-logger.mjs
  const here = dirname(fileURLToPath(import.meta.url));
  const projectDir = resolve(here, '..', '..');
  const runsDir = join(projectDir, 'docs', 'agent-runs');

  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }

  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch { /* non-JSON */ }

  const event = payload.hook_event_name || process.env.CM_EVENT || 'Unknown';
  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};

  // Only record pipeline-relevant events: subagent invocations and session
  // lifecycle. Everything else (file edits, searches, etc.) is ignored so the
  // trail stays readable.
  const isAgentTool = /task|agent/i.test(toolName);
  const sessionEvents = ['SessionStart', 'SessionEnd', 'Stop', 'SubagentStop'];
  if (!isAgentTool && !sessionEvents.includes(event)) return;

  // Resolve the active run slug.
  let slug = '_unassigned';
  try {
    const activePath = join(runsDir, '.active');
    if (existsSync(activePath)) {
      const v = readFileSync(activePath, 'utf8').trim();
      if (v) slug = v.replace(/[^A-Za-z0-9._-]/g, '');
    }
  } catch { /* fall back to _unassigned */ }

  const rec = {
    ts: new Date().toISOString(),
    event,
    session: payload.session_id || null,
  };

  if (isAgentTool) {
    rec.kind = event === 'PreToolUse' ? 'agent_invoked' : 'agent_finished';
    rec.agent = toolInput.subagent_type || toolInput.subagentType || null;
    if (toolInput.description) rec.description = String(toolInput.description).slice(0, 200);
    if (toolInput.prompt) rec.prompt_preview = String(toolInput.prompt).slice(0, 200);
  } else {
    rec.kind = 'session';
  }

  try {
    mkdirSync(runsDir, { recursive: true });
    appendFileSync(join(runsDir, `${slug}.events.jsonl`), JSON.stringify(rec) + '\n');
  } catch { /* best-effort */ }
}

try { main(); } catch { /* never break the session */ }
process.exit(0);
