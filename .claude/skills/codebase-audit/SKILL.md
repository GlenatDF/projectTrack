# Codebase Audit

## Purpose
Use this skill when doing a structured quality review of the codebase.
Produces a rated assessment with categorised findings and prioritised recommendations.

## When to use it
- Periodically, after a batch of features has landed
- Before a milestone or release
- When the user asks for a codebase rating or health check
- When a specific area (security, performance, reliability) needs a focused review

## What to audit

Work through every key file. For each, look for:

**Correctness**
- Logic errors, wrong assumptions, edge cases that are not handled
- Silent failures — errors swallowed without user feedback
- Optimistic UI updates that are not rolled back on failure

**Security**
- Command injection: shell commands built from user input (AppleScript, subprocess, etc.)
- SQL injection: any non-parameterised query construction
- Path traversal: user-controlled paths used in file operations without validation
- Exposed secrets or credentials in outputs or error messages

**Reliability**
- `unwrap()` / `expect()` / `.catch(() => {})` on paths that can realistically fail
- Mutex or lock patterns that could deadlock or leave the app unusable after a panic
- Race conditions in async flows

**Performance**
- N+1 query patterns — one DB/API call per item in a list
- Blocking the main thread during slow I/O
- Unnecessary re-renders or re-fetches

**Type safety**
- Unsafe casts (`as Unknown as X`, forced type assertions)
- Missing null checks on values that can realistically be null
- Unhandled promise rejections

**Dead code**
- Unused exports, stale fields, unreachable branches
- Functionality described in docs that no longer exists

**Data integrity**
- Missing transactions where multiple writes should be atomic
- Validation that is present on one path but missing on an equivalent path

## Rating scale

Score out of 10:
- **9–10**: Production-ready; only minor polish items
- **8**: Solid; one or two medium issues worth fixing soon
- **7**: Works reliably for the happy path; notable gaps that should be addressed
- **6**: Functional but fragile; several correctness or reliability issues
- **5 or below**: Significant problems that affect day-to-day use

## Output format

```
## Score: X/10

### Critical
- [File:line] — Issue description — Impact

### High
- [File:line] — Issue description — Impact

### Medium
- [File:line] — Issue description — Impact

### Low
- [File:line] — Issue description — Impact

### Strengths
- [What is genuinely good — be specific]

### Recommendations (priority order)
1. [Most important fix]
2. [Next most important fix]
...
```

## Rules for a good audit

- Read every key file, not just the ones you know well — surprises live in the quiet corners
- Be specific: file path, approximate line, exact issue, real impact
- Do not flag issues that were already fixed in the current session
- Do not inflate severity to make the audit look thorough — accurate beats alarming
- Distinguish between "this will cause a bug" (correctness) and "this could cause a bug under unusual conditions" (reliability)
- Strengths section is not optional — note what is genuinely working well

## Before giving a final score

1. List the main files and modules reviewed — make the evidence base explicit
2. Work through all audit categories before settling on a score; do not score early and retrofit findings
3. Label each finding as one of:
   - **Confirmed** — verified directly in the code and sufficient to support the stated concern
   - **Likely** — strong evidence in the code, but the real impact depends on runtime conditions or surrounding usage
   - **Needs verification** — plausible concern that cannot be confirmed without running the app or exercising the flow
4. Do not let a cluster of low-severity issues inflate the score downward, or a clean-looking surface hide unread modules
