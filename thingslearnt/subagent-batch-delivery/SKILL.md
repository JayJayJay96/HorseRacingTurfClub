---
name: subagent-batch-delivery
description: Use when executing a multi-task implementation plan with subagents in one repo/branch. Covers batching, briefing, parallel review, git hygiene with concurrent agents, and what reviews actually catch.
---

# Delivering a plan with subagents

Learnt running brainstorm → spec → plan → subagent build → review → screenshots → deploy cycles.

## Planning

- Delegate the detailed plan to a strong-model agent that **reads the real code**; brief it with
  the spec, the previous plan as a format template, file list, ordering and the tricky invariants.
  It finds spec/code mismatches (e.g. odds averaging ignoring a new attribute). Review its report
  before building.
- Brainstorm one question per message with a recommended option first; present the design in
  short parts; write the spec with the owner's decisions as a list.

## Building

- **Batch related plan tasks** (sim, server, UI, render) into one implementer run each, then
  resume the *same* agent for follow-ups — it keeps context.
- Point the implementer at exact line ranges of the plan instead of pasting; list the invariants
  that matter (fingerprint, deploy-free, file-staging rules).
- Cheaper model for well-specified batches; strongest model for WebGL/architecture or planning.
- Tell agents about local hooks (e.g. a fact-forcing gate) and how to answer them.

## Reviewing

- One reviewer per batch with explicit checks (security of RPCs, determinism, a11y, per-frame
  cost). Reviews caught real issues every time: stencil buffer missing, rain hidden in countdown,
  z-fighting, banner invisible in fullscreen, unwrapped strip overflowing phones, sandbox crash on
  an invalid option, misleading commentary after tuning.
- A **read-only reviewer can run in parallel** with the next implementer or a screenshot agent.
- Don't fix reviewer nits that are false alarms — verify (e.g. a CSS class the reviewer thought
  missing existed in another file).

## Git hygiene with several agents

- Agents stage **only their own files by explicit path**; never `git add -A`, never
  `prettier --write` folders (CRLF repos: it rewrites line endings of untouched files).
- Concurrent commits: tell agents to retry on `index.lock`.
- Before finishing, check `git status` for stray line-ending-only changes
  (`git diff --ignore-cr-at-eol --stat` empty → `git checkout --` them).

## Showing the owner

- Always end UI work with **real-flow screenshots** (headless Playwright, phone 390×844 and board
  1920×1080), contact sheets, and look at them yourself before sending.
- Ask before every outward step (push/deploy) unless the owner pre-approved that specific change.
