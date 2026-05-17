---
name: test-driven-development
description: Drives development with tests. Use when implementing any logic, fixing any bug, or changing any behavior. Use when you need to prove that code works, when a bug report arrives, or when you're about to modify existing functionality.
---

# Test-Driven Development

## Overview

Write a failing test before writing the code that makes it pass. For bug fixes, reproduce the bug with a test before attempting a fix. Tests are proof — "seems right" is not done. A codebase with good tests is an AI agent's superpower; a codebase without tests is a liability.

## When to Use

- Implementing any new logic or behavior
- Fixing any bug (the Prove-It Pattern)
- Modifying existing functionality
- Adding edge case handling
- Any change that could break existing behavior

**When NOT to use:** Pure configuration changes, documentation updates, or static content changes that have no behavioral impact.

## The TDD Cycle

```
    RED                GREEN              REFACTOR
 Write a test    Write minimal code    Clean up the
 that fails  -->  to make it pass  -->  implementation  -->  (repeat)
```

### Step 1: RED — Write a Failing Test

Write the test first. It must fail. A test that passes immediately proves nothing.

```typescript
describe('TaskService', () => {
  it('creates a task with title and default status', async () => {
    const task = await taskService.createTask({ title: 'Buy groceries' });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Buy groceries');
    expect(task.status).toBe('pending');
    expect(task.createdAt).toBeInstanceOf(Date);
  });
});
```

### Step 2: GREEN — Make It Pass

Write the minimum code to make the test pass. Don't over-engineer.

### Step 3: REFACTOR — Clean Up

With tests green, improve the code without changing behavior. Run tests after every refactor step.

## The Prove-It Pattern (Bug Fixes)

When a bug is reported, do not start by trying to fix it. Start by writing a test that reproduces it.

```
Bug report arrives
       |
       v
  Write a test that demonstrates the bug --> Test FAILS (bug confirmed)
       |
       v
  Implement the fix --> Test PASSES (fix works)
       |
       v
  Run full test suite (no regressions)
```

## The Test Pyramid

```
          /\
         /  \         E2E Tests (~5%)
        /    \
       /------\
      /        \      Integration Tests (~15%)
     /          \
    /------------\
   /              \   Unit Tests (~80%)
  /                \
 /------------------\
```

**The Beyonce Rule:** If you liked it, you should have put a test on it.

### Test Sizes

| Size | Constraints | Speed | Example |
|------|------------|-------|---------|
| **Small** | Single process, no I/O, no network | Milliseconds | Pure function tests |
| **Medium** | Multi-process OK, localhost only | Seconds | API tests with test DB |
| **Large** | External services allowed | Minutes | E2E tests, benchmarks |

## Writing Good Tests

### Test State, Not Interactions

Assert on the *outcome* of an operation, not on which methods were called internally.

```typescript
// Good: Tests what the function does (state-based)
it('returns tasks sorted by creation date, newest first', async () => {
  const tasks = await listTasks({ sortBy: 'createdAt', sortOrder: 'desc' });
  expect(tasks[0].createdAt.getTime())
    .toBeGreaterThan(tasks[1].createdAt.getTime());
});
```

### DAMP Over DRY in Tests

In tests, **DAMP (Descriptive And Meaningful Phrases)** is better than DRY. Each test should tell a complete story.

### Prefer Real Implementations Over Mocks

```
Preference order (most to least preferred):
1. Real implementation  --> Highest confidence, catches real bugs
2. Fake                 --> In-memory version of a dependency
3. Stub                 --> Returns canned data, no behavior
4. Mock (interaction)   --> Verifies method calls — use sparingly
```

### Arrange-Act-Assert

```typescript
it('marks overdue tasks when deadline has passed', () => {
  // Arrange
  const task = createTask({ title: 'Test', deadline: new Date('2025-01-01') });

  // Act
  const result = checkOverdue(task, new Date('2025-01-02'));

  // Assert
  expect(result.isOverdue).toBe(true);
});
```

## Test Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Testing implementation details | Tests break when refactoring | Test inputs and outputs |
| Flaky tests | Erode trust in the test suite | Use deterministic assertions |
| Testing framework code | Wastes time | Only test YOUR code |
| Snapshot abuse | Large snapshots nobody reviews | Use sparingly |
| No test isolation | Tests pass individually but fail together | Each test sets up/tears down its own state |
| Mocking everything | Tests pass but production breaks | Prefer real implementations |

## When to Use Subagents for Testing

For complex bug fixes, spawn a subagent to write the reproduction test. This separation ensures the test is written without knowledge of the fix, making it more robust.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll write tests after the code works" | You won't. And tests written after the fact test implementation, not behavior. |
| "This is too simple to test" | Simple code gets complicated. The test documents expected behavior. |
| "Tests slow me down" | Tests slow you down now. They speed you up every time you change the code later. |
| "I tested it manually" | Manual testing doesn't persist. Tomorrow's change might break it. |
| "The code is self-explanatory" | Tests ARE the specification. They document what the code should do. |

## Red Flags

- Writing code without any corresponding tests
- Tests that pass on the first run (may not be testing what you think)
- Bug fixes without reproduction tests
- Tests that test framework behavior instead of application behavior
- Skipping tests to make the suite pass

## Verification

After completing any implementation:

- [ ] Every new behavior has a corresponding test
- [ ] All tests pass: `npm test`
- [ ] Bug fixes include a reproduction test that failed before the fix
- [ ] Test names describe the behavior being verified
- [ ] No tests were skipped or disabled
- [ ] Coverage hasn't decreased (if tracked)
