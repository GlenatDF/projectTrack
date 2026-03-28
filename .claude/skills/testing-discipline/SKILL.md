# Testing Discipline

## Purpose
Use this skill whenever implementing, modifying, or reviewing code so testing is reported
honestly and performed at the right level for the change.

## Core Principles
- "Build passed" is not the same as "tested".
- Always distinguish between build/type checks, manual testing, and automated tests.
- Never imply a behaviour was verified unless it was actually verified.
- Prefer small, specific, truthful testing notes over vague claims.

## Required Testing Categories

### 1. Build / Type Checks
- Examples: `npm run build`, `cargo build`, linting, type checking
- These confirm code compiles or passes static checks
- These do **not** prove the feature works correctly

### 2. Manual Functional Testing
- Verify the actual user flow where practical
- Click through the feature in the running app
- Check validation, loading, success, error, and disabled states
- Confirm the UI behaves as expected in both light and dark mode

### 3. Automated Tests
- Add or run automated tests for pure logic and helper functions where practical
- Prefer focused tests for logic that can be verified reliably
- Do not force heavy test scaffolding for tiny changes unless it already fits the project

## Reporting Format

When summarising any implementation chunk, always include this section:

```
Testing performed
- Build/type checks:
    - [exact commands run]
- Manual testing:
    - [exact behaviours verified]
- Automated tests:
    - [tests added or run, or "none — no test runner configured for this layer"]
- Limitations:
    - [what was not tested]
```

## Honesty Rules
- If only compilation was checked, say that clearly
- If manual testing was not performed (e.g. app was not launched), say so
- If no automated tests exist for this layer, say so clearly
- Do not use vague wording like "tested" or "tested and working" without details

## UI Testing Checklist
For UI changes, verify as many of these as are relevant:
- [ ] Main happy path
- [ ] Validation states (empty fields, invalid input)
- [ ] Loading / running states
- [ ] Success state
- [ ] Error state
- [ ] Disabled controls
- [ ] Navigation outcomes
- [ ] Light mode readability
- [ ] Dark mode readability
- [ ] Pill, badge, chip, and helper text readability

## Logic / Helper Testing
For pure functions and helpers:
- Add unit tests where the project test runner supports it
- Tests should be small and focused — one behaviour per test
- If the project has no test runner set up, note that explicitly rather than skipping

## Good Example

```
Testing performed
- Build/type checks:
    - Ran `npm run build` — clean
    - Ran `cargo build` — clean
- Manual testing:
    - Opened the New Project wizard
    - Verified step navigation (Next / Back)
    - Verified empty project name triggers validation error
    - Verified Create button is disabled while running
    - Verified success state appears after completion
    - Verified light mode and dark mode badge readability
- Automated tests:
    - Added tests for buildProgressSteps() covering 3 config variants
- Limitations:
    - Did not simulate backend error path manually
```

## Bad Example

```
- Tested and working
```
