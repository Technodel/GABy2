---
name: doubt-driven-development
description: Cross-examines non-trivial decisions in-flight. Use when stakes are high, the codebase is unfamiliar, or a decision has significant tradeoffs.
---

# Doubt-Driven Development

## Overview

An adversarial fresh-context review loop. Before committing a non-trivial decision, SUNy steps back and interrogates its own reasoning as if it were a different engineer reviewing the work.

## When to Use

- Architectural or design decisions with significant impact
- Working in unfamiliar parts of the codebase
- Complex refactoring or migrations
- High-stakes changes (production-critical paths, security-sensitive code)
- When you find yourself thinking "this feels right but I'm not 100% sure"

## The Doubt Loop

```
CLAIM ──→ EXTRACT ──→ DOUBT ──→ RECONCILE ──→ STOP
```

### Step 1: CLAIM

State the decision you're about to make as a clear, falsifiable claim:

```
CLAIM: Using a WebSocket connection for real-time updates is better than polling
because it reduces latency and server load.
```

### Step 2: EXTRACT

Extract all implicit assumptions behind the claim:

- What am I assuming about the infrastructure?
- What am I assuming about the user's environment?
- What am I assuming about future requirements?
- What am I assuming about performance characteristics?

### Step 3: DOUBT

For each assumption, ask: "Is this actually true?"

- What would happen if this assumption is wrong?
- Is there evidence (docs, data, precedent) supporting this assumption?
- Is there evidence contradicting it?
- What's the cheapest way to validate this assumption?

### Step 4: RECONCILE

Based on the doubt step, either:
- **Proceed** — assumptions validated, confidence is high
- **Adjust** — modify the approach based on what you found
- **Escalate** — flag the decision for human input with clear tradeoffs

### Step 5: STOP

Document the outcome:
- What was decided and why
- What alternatives were considered and rejected (with rationale)
- What assumptions were validated

## When NOT to Use

- Trivial naming decisions
- Standard CRUD patterns
- Any decision where the answer is clearly dictated by project conventions

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I've done this before, I know it works" | Every codebase has unique constraints. Verify assumptions in THIS context. |
| "The tests pass, so the approach is correct" | Tests confirm behavior, not architectural soundness. |
| "This is the standard pattern" | "Standard" doesn't mean "correct for this situation." |

## Verification

- [ ] All implicit assumptions extracted and examined
- [ ] Each assumption validated against evidence
- [ ] Decision documented with rationale and rejected alternatives
