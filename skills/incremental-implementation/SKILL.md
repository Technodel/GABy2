---
name: incremental-implementation
description: Delivers changes incrementally. Use when implementing any feature or change that touches more than one file. Use when you're about to write a large amount of code at once.
---

# Incremental Implementation

## Overview

Build in thin vertical slices — implement one piece, test it, verify it, then expand. Avoid implementing an entire feature in one pass. Each increment should leave the system in a working, testable state.

## When to Use

- Implementing any multi-file change
- Building a new feature from a task breakdown
- Refactoring existing code
- Any time you're tempted to write more than ~100 lines before testing

## The Increment Cycle

```
Implement ──→ Test ──→ Verify ──→ Commit ──→ Next slice
```

For each slice:
1. **Implement** the smallest complete piece of functionality
2. **Test** — run the test suite
3. **Verify** — confirm the slice works (tests pass, build succeeds)
4. **Commit** — save progress with a descriptive message
5. **Move to the next slice**

## Slicing Strategies

### Vertical Slices (Preferred)
Build one complete path through the stack per slice (DB → API → UI).

### Contract-First Slicing
Define API contract first, then implement backend and frontend against it.

### Risk-First Slicing
Tackle the riskiest piece first. If it fails, discover it before investing in dependent slices.

## Implementation Rules

### Rule 0: Simplicity First
Ask "What is the simplest thing that could work?" before writing code.

### Rule 0.5: Scope Discipline
Touch only what the task requires. Note improvements outside scope — don't fix them.

### Rule 1: One Thing at a Time
Each increment changes one logical thing. Don't mix concerns.

### Rule 2: Keep It Compilable
After each increment, the project must build and existing tests must pass.

### Rule 3: Feature Flags for Incomplete Features
Gate incomplete features behind flags to merge to main without exposing.

### Rule 4: Safe Defaults
New code should default to safe, conservative behavior.

### Rule 5: Rollback-Friendly
Each increment should be independently revertable.

## Increment Checklist

After each increment:
- [ ] The change does one thing and does it completely
- [ ] All existing tests still pass
- [ ] The build succeeds
- [ ] The new functionality works as expected
- [ ] The change is committed with a descriptive message

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll test it all at the end" | Bugs compound. A bug in Slice 1 makes Slice 2 wrong. |
| "It's faster to do it all at once" | Until something breaks and you can't find the cause among 500 changed lines. |
| "This refactor is small enough to include" | Refactors mixed with features make both harder to review. Separate them. |

## Red Flags

- More than 100 lines written without running tests
- Multiple unrelated changes in a single increment
- Skipping the test/verify step to move faster
- Build or tests broken between increments
- Creating abstractions before the third use case demands it
