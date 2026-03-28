# Feature Chunking

## Purpose
Use this skill when planning or implementing a non-trivial feature or change.
Explore first, break the work into reviewable chunks, implement one chunk at a time.

## When to use it
- Before starting any feature that touches more than 2–3 files or has uncertain scope
- When a task turns out to be larger than expected mid-session
- When the right approach is unclear and needs to be structured before any code is written

## Phase 1 — Planning pass (do this before writing code)

1. **Read the relevant code** — understand what already exists before proposing anything
2. **Identify unknowns** — list anything technically or product-wise unclear; resolve the most important ones before proceeding
3. **Propose a chunk breakdown** — break the work into the smallest steps that are each independently useful and verifiable
4. **Get confirmation where appropriate** — show the breakdown to the user before starting, especially when scope, trade-offs, or sequence matter; for obvious small plans, a brief summary is enough

Good chunk rules:
- Each chunk should be completable in one focused session
- Each chunk should produce a clear, verifiable result
- Do not mix concerns in one chunk (e.g. "build UI and wire up API" = two chunks)
- Order by dependency and risk — uncertain or risky items first, polish last

## Phase 2 — Implementation (one chunk at a time)

- Implement only the current chunk — do not get ahead
- Make the smallest change that achieves the goal
- Do not refactor code that is not directly related to the current chunk
- Do not add features, options, or configuration that were not asked for
- Keep diffs small and focused — a 50-line targeted change is better than a 500-line sprawl
- Prefer editing existing patterns over introducing new ones
- If you notice an existing bug, flag it — do not fix it in this change unless asked

Security rules (apply to every chunk):
- Never introduce SQL injection, XSS, command injection, or path traversal
- Validate input at system boundaries — trust internal code and framework guarantees
- Do not expose secrets, credentials, or internal paths in outputs
- If the security implications of a change are unclear, say so before proceeding

## Phase 3 — After each chunk

1. Run the build and type checks — confirm clean
2. If the chunk changed visible UI, manually verify the affected flow where practical
3. Report testing honestly using the testing-discipline format
4. Flag any scope discovered during implementation that should become its own chunk
5. If a significant decision was made, log it

## Red flags — stop and check with the user

- The change is touching more files than the chunk plan anticipated
- The change requires modifying a data model, API contract, or public interface
- The change introduces a new dependency
- Something feels architecturally wrong but you cannot explain it yet
