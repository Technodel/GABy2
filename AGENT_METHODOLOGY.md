# Agent Methodology: Closed-Loop Task Execution

> Inject this into any AI coding agent. No project-specific references.

---

## Core Principle

The agent operates as a **closed-loop system**:

```
ANALYZE → PROBE → BUILD → MEASURE → DIAGNOSE → FIX → repeat until DONE
```

Every step feeds into the next. The agent **never assumes — it always verifies**.
The moment it acts without measuring, it's guessing. Guessing fails on real-world complexity.

---

## Phase 1: SITUATIONAL ANALYSIS

Before writing any code:

1. **Inventory what exists** — list relevant files, read them, check database schema, check environment config
2. **Understand the pipeline end-to-end** — where does data enter, transform, land?
3. **Measure current state** — counts, samples, schema
4. **Define target state** — what exact change is needed?
5. **Calculate the gap** — delta between current and target

First tool calls must be **reads, not writes**. Query before touching.

---

## Phase 2: PROBE REALITY (The Diagnostic Script)

This is the single most important pattern. **Before modifying any parser, extractor, or pipeline, write a diagnostic script.**

### Diagnostic Script Template

```javascript
// Single-purpose throwaway script — prints raw truth

// 1. Fetch the raw data
const data = await fetch("https://target.com/page/");
const html = data.body;
console.log("Response length:", html.length);

// 2. Find the KEY MARKER — print context around it
const idx = html.indexOf("data-product-id");
console.log("Context around marker:", html.slice(idx - 300, idx + 600));

// 3. Test candidate regex patterns one at a time
const matches = html.match(/YOUR_PATTERN/g);
console.log("Matches found:", matches?.length || 0);
console.log("First 3:", matches?.slice(0, 3));
```

### When to Write a Diagnostic

- Before writing any parser/extractor
- When a script returns unexpected output (0 results, wrong values, errors)
- When pipeline behavior doesn't match expectations
- When verifying at any stage boundary

### Why This Pattern Works

1. Eliminates assumptions — you see actual content, not memory
2. Fast feedback — one script, one run, instant answer
3. Reveals structural surprises — what worked yesterday may not work today
4. Saves debugging cycles — fix the right problem the first time

---

## Phase 3: BUILD INCREMENTALLY

### One Feature Per Test

Don't build the full solution at once. Layer it:

```
Step 1: Can you find the container boundaries?    → test → fix
Step 2: Can you extract the identifier?            → test → fix
Step 3: Can you extract the primary field?         → test → fix
Step 4: Can you extract remaining fields?          → test → fix
```

Each step is a separate run. Add ONE extraction rule, test, verify output, then add the next.

### The Testing Loop

```
Write feature → Run on small sample → Print first 3 results → Eyeball them
                                          ↓
    All look correct?       → Proceed to next feature
    Something wrong?        → Fix that specific regex/rule → Rerun
```

### Regex Extraction Rules for Unstructured Data

1. **Anchor on structural wrappers** (container elements), not content
2. **Extract IDs from attributes**, not text
3. **Prefer specific selectors** (deepest relevant element) over first match
4. **Blacklist known junk** patterns (admin routes, cart URLs, javascript:)
5. **Deduplicate by ID** within each page/source using a Set
6. **Always normalize** — strip query strings, hashes, trailing slashes

---

## Phase 4: EXECUTE AT SCALE

### Validate Before Scaling

1. Test the full pipeline on 1-2 pages/inputs first
2. Verify output rows/results look correct
3. Only then run on all inputs

### Progress and Memory

- Log progress every N items with timestamps
- Report counts at each phase boundary
- For large inputs, prefer streaming/iterator patterns over loading everything into memory
- Set generous memory limits for large payloads

---

## Phase 5: VERIFY — Zero Trust

### Verify at Every Stage Boundary

| Stage | Verification |
|-------|-------------|
| After extraction | Count unique items found |
| After filtering | Count existing vs new |
| After storage | SELECT COUNT(*) / count rows |
| Final | Sample rows, value distribution, quality metrics |

### Verification Script Pattern

```javascript
// Runs after each phase
const count = await db.execute("SELECT COUNT(*) FROM target_table");
console.log("Rows:", count.rows[0].cnt);

// Check for NULLs, zeros, empty strings
// Check MIN/MAX/AVG for numeric fields
// Sample random rows for manual inspection
// Check fill rate: what % have non-null images, descriptions, etc.
```

### Completeness Checklist

- Did the count match the target?
- Are there unexpected NULLs or zeros?
- Are values in reasonable ranges?
- Are identifiers unique?
- Do sample rows look correct on visual inspection?

---

## Phase 6: ERROR RECOVERY

### When Something Fails: The Golden Rule

```
DON'T: "Maybe X changed, let me try a different approach"
DO:    Write diagnostic → Fetch actual data → Print exact content → Identify real issue → Fix
```

### Common Failures and Responses

| Symptom | Diagnostic Action |
|---------|------------------|
| 0 results found | Print data length, search for key markers, print context around them |
| Wrong values extracted | Print the surrounding block, identify which element is being matched |
| Duplicates | Search for multiple occurrences of the ID attribute per container |
| OOM / crash | Measure data size, switch to streaming/iterator approach |
| Database locked | Kill competing processes before writes |
| Silent failures | Check for case-sensitive variable names, unthrown exceptions |

### The "One Fix Per Attempt" Rule

Change ONE thing. Run. Verify output changed as expected. Then change the next thing.
Never change multiple variables at once — you won't know which fix worked.

---

## The Complete Agent Loop (Pseudocode)

```
function solveTask(goal):
    // 1. UNDERSTAND
    files = listRelevantFiles()
    schema = inspectDatabase()
    env = readEnvironment()
    currentState = measureCurrentState()
    targetState = parseGoal(goal)
    gap = targetState - currentState

    // 2. PROBE REALITY
    if taskInvolvesParsing or taskInvolvesExternalData:
        diagnostic = writeDiagnosticScript()
        reality = run(diagnostic)
        validateAssumptions(reality)
        if reality.differsFrom(assumptions):
            fixAssumptions(reality)
            goto PROBE_REALITY

    // 3. BUILD INCREMENTALLY
    features = breakDownIntoAtomicSteps(gap)
    for each feature in features:
        implement(feature)
        output = runPartial()
        if output.isCorrect():
            continue
        else:
            diagnostic = writeDiagnosticScript(feature)
            inspectOutput(output)
            rootCause = identifyRootCause(diagnostic)
            fix(rootCause)
            retest(feature)

    // 4. EXECUTE
    output = runFull()
    monitorProgress(output)

    // 5. VERIFY
    finalState = measureFinalState()
    assert finalState.matches(targetState)
    qualityMetrics = measureQuality(finalState)
    report(qualityMetrics)

    // 6. DELIVER
    return summary(counts, samples, metrics)
```

---

## Key Decisions That Prevent Failure

### 1. Streaming/Iterator over Bulk Loading
Loading entire datasets into memory causes crashes. Use iterators, batches, and streaming patterns for large payloads.

### 2. Normalized Identifiers for Deduplication
Different systems use different ID schemes. Normalize to a common format (usually the URL or a canonical ID) before comparing.

### 3. Structural Anchors for Extraction
Anchor on the most stable container element, not the data field you want. Data attributes can be duplicated across elements within the same container.

### 4. Diagnostic Scripts Stay Separate
Diagnostic scripts are throwaway. They have one purpose: print raw data. They don't share code with production pipelines. This prevents "debug mode" complexity from leaking into working code.

---

## Essential Agent Rules

Copy these into your agent's system prompt:

```
<Rule id="verify-first">
Before any code change, use tools to inspect actual files, database state,
and environment. Never act on assumptions or memory.
</Rule>

<Rule id="probe-reality">
When output is unexpected, write a diagnostic script that prints raw data
at the point of failure. Inspect actual content, not what you expect.
</Rule>

<Rule id="one-change-per-attempt">
Modify exactly one logic block per test run. Verify the output changed as
expected before making the next change.
</Rule>

<Rule id="verify-each-phase">
After every pipeline phase, run a verification query that checks counts,
samples, and data quality. Report the numbers.
</Rule>

<Rule id="streaming-for-scale">
For inputs larger than 100KB, prefer streaming/iterator patterns over
loading full data structures into memory.
</Rule>

<Rule id="structural-anchor">
Anchor extraction on the most stable structural wrapper, not on the data
attributes you want to extract. Data attributes may be duplicated.
</Rule>

<Rule id="normalized-dedup">
When filtering against existing records, compare normalized identifiers.
Different ID schemes between source and target cause silent mismatches.
</Rule>

<Rule id="no-guess">
When uncertain, write a diagnostic and inspect. Never guess what a regex
will match or what a query will return.
</Rule>

<Rule id="diagnostic-isolation">
Diagnostic/debug scripts are independent throwaway files. They do not
share code with the main pipeline and are not committed.
</Rule>
```

---

## The Meta-Lesson

The reason this approach succeeds where others fail is not about model intelligence.
It's about **process discipline**:

- Other agents jump to writing the solution → they guess at the data structure → they fail
- This approach writes a **diagnostic first** → sees actual data → writes correct logic → succeeds

The agent must be trained to **distrust its own assumptions** and **always verify against reality**.

The diagnostic script is the most powerful tool in this methodology.
It converts "I think the data looks like X" into "The data at offset N contains: ..."
That's the difference between guessing and knowing.

**Cycle time is everything.** The interval from "write code" to "see output" must be as short as possible. Every loop iteration that doesn't include a measurement is wasted compute.
