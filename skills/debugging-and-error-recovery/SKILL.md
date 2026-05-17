---
name: debugging-and-error-recovery
description: Debugs and recovers from errors. Use when an error occurs during development — compiler errors, runtime errors, test failures, or unexpected behavior.
---

# Debugging and Error Recovery

## Overview

A systematic 5-step workflow for diagnosing and fixing errors. This skill extends SUNy's existing `self_heal` tool with a structured triage process.

## When to Use

- Compiler/build errors
- Runtime exceptions or crashes
- Test failures
- Unexpected behavior
- Any error SUNy encounters during a task

## The 5-Step Triage Workflow

```
1. REPRODUCE ──→ 2. LOCALIZE ──→ 3. REDUCE ──→ 4. FIX ──→ 5. GUARD
```

### Step 1: REPRODUCE

Get the exact error. Run the failing command yourself. Capture:
- Exact error message and stack trace
- Input/conditions that trigger it
- Is it consistently reproducible?

**Don't guess what the error looks like — run the command.**

### Step 2: LOCALIZE

Find the specific code responsible:
- Match stack trace lines to source files
- Identify the function/module where the error originates
- Distinguish between root cause vs. surface symptom

### Step 3: REDUCE

Minimize the failing input until you have the smallest possible reproduction:
- Strip away unrelated code
- Isolate the minimal call that triggers the error
- This confirms you've found the real cause, not a symptom

### Step 4: FIX

Apply the correction:
- Understand WHY the original code was wrong (not just what to change)
- Make the minimal change needed — no cleanup or refactoring
- Verify the fix resolves the original reproduction case

### Step 5: GUARD

Prevent recurrence:
- Add a test that would have caught this error
- If applicable, add runtime validation or assertions
- Consider if similar bugs exist elsewhere in the codebase

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I know what the error is, no need to run it" | You're often wrong. Run the command. |
| "The stack trace points to line 42, so that's the bug" | The stack trace points to where the error surfaced, not necessarily the root cause. Trace backwards. |
| "I'll add a test for this later" | Later never comes. Add the guard test now. |

## Red Flags

- Fixing an error without reproducing it
- Changing code based on reading the error message without understanding the root cause
- Making multiple changes at once to "see what sticks"
- Removing a test instead of fixing the underlying issue
