---
name: code-review-and-quality
description: Reviews code for quality, correctness, and consistency. Use before merging any changes or when asked to review code.
---

# Code Review and Quality

## Overview

A structured five-axis approach to code review. Not a superficial pass — flag real issues with concrete evidence.

## When to Use

- Before merging changes to main
- When asked to review code
- After completing implementation
- When quality concerns arise

## The Five-Axis Review

### Axis 1: Correctness

Does the code do what it's supposed to?
- Does it match the spec/requirements?
- Are edge cases handled (empty states, null inputs, boundary conditions)?
- Are there off-by-one errors, race conditions, or logic flaws?
- Do error paths actually work, or are errors silently caught and swallowed?

### Axis 2: Maintainability

Will this code be easy to change in 6 months?
- Are names descriptive and honest? (A function named `process` is lying to you.)
- Is there unnecessary complexity that could be simplified?
- Are there TODOs or dead code paths?
- Would a new developer understand how this code works?

### Axis 3: Safety

Could this code cause production issues?
- Are inputs validated at boundaries?
- Are there type safety gaps (`any`, unsafe casts)?
- Could this break under load?
- Are secrets or sensitive data exposed anywhere?

### Axis 4: Performance

Is this code unnecessarily wasteful?
- Are there N+1 queries, redundant computations, or memory leaks?
- Could this be done with fewer allocations?
- Are there synchronous operations blocking async paths?

### Axis 5: Consistency

Does this code follow the project conventions?
- Does it use the same patterns as surrounding code?
- Does it follow the established coding style?
- Does it use the right imports, error handling patterns, and testing approach?

## Review Output Format

For each issue found, provide:

```
[SEVERITY] [Axis] File:line — Description
  Evidence: [concrete proof — code, test output, documentation]
  Suggestion: [actionable fix]
```

Severity levels: **BLOCKING** (must fix), **MAJOR** (should fix), **MINOR** (nice to fix), **PRAISE** (good code worth noting)

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This code works, let's merge it" | Working code != correct, maintainable, safe code. |
| "The tests pass, so it's fine" | Tests only cover what they test. What about untested paths? |
| "I'll clean this up in the next PR" | Next PRs never come to clean up. Fix it now or it ships as-is. |

## Verification

- [ ] All 5 axes reviewed: correctness, maintainability, safety, performance, consistency
- [ ] Each BLOCKING issue has been resolved or explicitly waived
- [ ] Tests still pass after review changes
