---
name: spec-driven-development
description: Creates specs before coding. Use when starting a new project, feature, or significant change and no specification exists yet. Use when requirements are unclear, ambiguous, or only exist as a vague idea.
---

# Spec-Driven Development

## Overview

Write a structured specification before writing any code. The spec is the shared source of truth between you and the human engineer — it defines what we're building, why, and how we'll know it's done.

## When to Use

- Starting a new project or feature
- Requirements are ambiguous or incomplete
- The change touches multiple files or modules
- You're about to make an architectural decision

**When NOT to use:** Single-line fixes, typo corrections, or changes where requirements are unambiguous.

## The Gated Workflow

```
SPECIFY ──→ PLAN ──→ TASKS ──→ IMPLEMENT
   │          │        │          │
   ▼          ▼        ▼          ▼
 Human      Human    Human      Human
 reviews    reviews  reviews    reviews
```

### Phase 1: Specify

**Surface assumptions immediately.** Before writing any spec content, list what you're assuming:

```
ASSUMPTIONS I'M MAKING:
1. This is a web application (not native mobile)
2. Authentication uses session-based cookies (not JWT)
3. The database is PostgreSQL (based on existing Prisma schema)
→ Correct me now or I'll proceed with these.
```

Write a spec covering these core areas:

1. **Objective** — What are we building and why? What does success look like?
2. **Commands** — Full executable build/test/lint/dev commands.
3. **Project Structure** — Directory layout with descriptions.
4. **Code Style** — Naming conventions, formatting rules, example snippet.
5. **Testing Strategy** — Framework, coverage expectations, test levels.
6. **Boundaries** — Always/Ask First/Never framework.

### Phase 2: Plan

With the validated spec, generate a technical implementation plan:
1. Identify major components and their dependencies
2. Determine implementation order
3. Note risks and mitigation strategies
4. Define verification checkpoints

### Phase 3: Tasks

Break the plan into discrete implementable tasks:
- Each task completable in a single session
- Each task has explicit acceptance criteria
- Each task includes a verification step
- No task requires changing more than ~5 files

### Phase 4: Implement

Execute tasks following `incremental-implementation`.

## Keeping the Spec Alive

- Update when decisions change
- Update when scope changes
- Commit the spec to version control

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is simple, I don't need a spec" | Simple tasks don't need long specs, but they still need acceptance criteria. |
| "I'll write the spec after I code it" | That's documentation, not specification. |
| "The spec will slow us down" | A 15-minute spec prevents hours of rework. |

## Verification

- [ ] The spec covers all core areas
- [ ] The human has reviewed and approved the spec
- [ ] Success criteria are specific and testable
- [ ] Boundaries (Always/Ask First/Never) are defined
