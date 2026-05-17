#!/usr/bin/env python3
"""
SUNy Synthetic Training Data Generator — v2

Generates diverse coding-task conversations that demonstrate SUNy's behaviors:
  - 5-stage execution pipeline (INTENT_PARSE -> PLAN -> EXECUTION -> VERIFICATION -> FINALIZE)
  - XML tool-call format (<tool_call>, <tool_result>, <reasoning>)
  - Self-correction loops on lint/test failures
  - Proof summaries with files changed and check results

Output: 1,000+ training examples in ShareGPT JSONL format,
ready for Unsloth fine-tuning on Google Colab.

Usage:
  pip install openai tqdm
  export OPENAI_API_KEY=your_key_here
  python scripts/generate-suny-training-data.py --count 1200 --output ./suny-training-data.jsonl
"""

import argparse
import json
import os
import random
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from openai import OpenAI
from tqdm import tqdm

# ─── Config ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are SUNy — an AI coding assistant that reads projects, plans work, writes code, runs checks, and fixes issues automatically.

Core behaviors:
1. Follow the 5-stage pipeline: INTENT_PARSE -> PLAN -> EXECUTION -> VERIFICATION -> FINALIZE
2. In INTENT_PARSE: read files, explore, understand context. NEVER write files yet.
3. In PLAN: reason step-by-step, list files to touch, describe approach. NEVER write files.
4. In EXECUTION: write/edit files. Each edit is precise.
5. In VERIFICATION: run lint, run tests. If they fail, analyze the error and fix it.
6. In FINALIZE: summarize what changed, provide proof.

Output format rules (MANDATORY — must follow exactly):
- Use <reasoning> tags for your step-by-step thinking
- Use <tool_call> tags with tool name and JSON arguments
- Use <tool_result> tags for the output of each tool call
- Always end with a FINALIZE section using the 5-stage markers"""

# ─── Few-shot example showing the exact format ────────────────────────────────

FEW_SHOT_EXAMPLE = """
Here is an example of the EXACT format you must follow:

<reasoning>INTENT_PARSE: Let me read the current state of src/components/SearchBar.tsx to understand the component structure before making changes.</reasoning>
<tool_call>
  read_file({"path": "src/components/SearchBar.tsx"})
</tool_call>
<tool_result>
import React from 'react';
export function SearchBar() {
  return <input type="text" placeholder="Search..." />;
}
</tool_result>

<reasoning>PLAN: I need to add debounced filtering support. I'll modify SearchBar.tsx to accept onSearch callback and add debounce logic. Files to modify: src/components/SearchBar.tsx.</reasoning>

<tool_call>
  write_file({"path": "src/components/SearchBar.tsx", "content": "import React, { useState, useEffect } from 'react';\n\nexport function SearchBar({ onSearch }) {\n  const [query, setQuery] = useState('');\n\n  useEffect(() => {\n    const timer = setTimeout(() => onSearch(query), 300);\n    return () => clearTimeout(timer);\n  }, [query]);\n\n  return (\n    <input\n      type=\"text\"\n      value={query}\n      onChange={e => setQuery(e.target.value)}\n      placeholder=\"Search...\"\n    />\n  );\n}"})
</tool_call>
<tool_result>
Success — wrote 334 bytes to src/components/SearchBar.tsx
</tool_result>

<tool_call>
  run_lint({"path": "src/components/SearchBar.tsx"})
</tool_call>
<tool_result>
Lint passed — no errors found.
</tool_result>

<reasoning>FINALIZE: All done. I added debounced search to SearchBar.tsx with a 300ms delay. Lint passes clean.</reasoning>

✅ All done! Here's what I changed:
- Updated SearchBar.tsx: added debounced search with 300ms delay, onSearch callback, and cleanup on unmount.
"""

# ─── Task Templates ───────────────────────────────────────────────────────────

TASK_TEMPLATES: list[dict[str, Any]] = [
    # Feature
    {"type": "feature", "prompt": "Add a new {component} component at {path} that {behavior}", "complexity": "medium"},
    {"type": "feature", "prompt": "Create a {feature_type} hook at {path} that {behavior}", "complexity": "medium"},
    {"type": "feature", "prompt": "Add {feature_name} functionality to the {module} module: {requirement}", "complexity": "hard"},
    {"type": "feature", "prompt": "Implement {pattern_name} pattern in the {service} service so that {outcome}", "complexity": "hard"},
    {"type": "feature", "prompt": "Add dark mode toggle to the settings page. The toggle should persist to localStorage and apply instantly.", "complexity": "easy"},
    {"type": "feature", "prompt": "Create a pagination component that accepts data, page size, and renders page controls.", "complexity": "easy"},
    # Bug Fixes
    {"type": "bug", "prompt": "Fix the {error_type} error in {file_path}: {symptom}", "complexity": "medium"},
    {"type": "bug", "prompt": "The {component} component throws '{error_message}' when {condition}. Fix it.", "complexity": "medium"},
    {"type": "bug", "prompt": "Fix a race condition in the {module} module where {scenario}", "complexity": "hard"},
    {"type": "bug", "prompt": "The search feature returns duplicate results when the user types quickly. Fix the debounce logic.", "complexity": "easy"},
    {"type": "bug", "prompt": "Fix the 500 error on the checkout page when the cart is empty.", "complexity": "medium"},
    # Refactoring
    {"type": "refactor", "prompt": "Refactor {file_path}: {what_to_do}", "complexity": "medium"},
    {"type": "refactor", "prompt": "Convert all {old_pattern} patterns in {module} to {new_pattern}", "complexity": "hard"},
    {"type": "refactor", "prompt": "Extract the {logic_description} into a custom hook at {path}", "complexity": "medium"},
    {"type": "refactor", "prompt": "Rename the {old_name} interface to {new_name} and update all references across the project.", "complexity": "medium"},
    # Tests
    {"type": "test", "prompt": "Write unit tests for {file_path}. Cover: {test_cases}", "complexity": "medium"},
    {"type": "test", "prompt": "Add integration tests for the {endpoint} endpoint testing {scenarios}", "complexity": "hard"},
    # Review
    {"type": "review", "prompt": "Review {file_path} for {review_focus}. List all issues found.", "complexity": "medium"},
    # Docs
    {"type": "docs", "prompt": "Write JSDoc comments for all exported functions in {file_path}", "complexity": "easy"},
    # Config
    {"type": "config", "prompt": "Set up {tool_name} configuration for the project. Requirements: {requirements}", "complexity": "medium"},
    # Performance
    {"type": "perf", "prompt": "Optimize {file_path}: {bottleneck_description}. Target: {improvement_goal}", "complexity": "hard"},
    # Security
    {"type": "security", "prompt": "Audit {file_path} for {vuln_type} vulnerabilities and fix any found.", "complexity": "hard"},
]

# ─── Fill-in vocabulary ───────────────────────────────────────────────────────

VOCAB = {
    "component": ["UserCard", "DataTable", "ModalDialog", "SearchBar", "NavMenu", "FileUploader", "NotificationToast", "ProgressStepper", "DatePicker", "SidebarFilter"],
    "path": ["src/components/common/", "src/features/dashboard/", "src/shared/ui/", "src/modules/admin/", "src/pages/settings/"],
    "behavior": ["fetches user data and displays it in a card layout", "supports sorting, filtering, and pagination", "validates input before submission", "shows real-time search results as the user types", "manages nested navigation with active state highlighting", "handles drag-and-drop file selection with progress bar", "auto-dismisses after 3 seconds with fade animation", "tracks step completion state and allows back-navigation", "supports range selection and custom date formats", "filters a list by multiple criteria with AND/OR logic"],
    "feature_type": ["useDebouncedSearch", "useLocalStorage", "useMediaQuery", "useIntersectionObserver", "useClickOutside", "useKeyboardShortcut"],
    "feature_name": ["export-to-PDF", "real-time-collaboration", "offline-mode-caching", "bulk-edit", "keyboard-navigation", "undo-redo-history"],
    "module": ["auth", "billing", "notification", "search", "user-profile", "dashboard", "admin-panel", "file-storage"],
    "requirement": ["must handle concurrent requests without data loss", "should cache results for 5 minutes", "must validate all inputs before processing", "needs proper error handling with user-friendly messages", "should support both sync and async modes"],
    "pattern_name": ["Repository", "Observer", "Strategy", "Factory", "Singleton", "Command", "Mediator"],
    "service": ["UserService", "PaymentService", "EmailService", "SearchService", "NotificationService", "StorageService"],
    "outcome": ["different notification channels can be added without changing core logic", "external API changes don't affect business logic", "the system can switch between database providers at runtime", "background tasks are queued and retried on failure"],
    "error_type": ["TypeError", "ReferenceError", "SyntaxError", "RuntimeError", "NullPointerException", "IndexOutOfBounds"],
    "file_path": ["src/services/auth.service.ts", "src/components/checkout/checkout-form.tsx", "src/utils/format-currency.ts", "src/hooks/use-api.ts", "src/store/user-store.ts", "src/api/routes/orders.ts"],
    "symptom": ["the page crashes when data is null", "the dropdown doesn't close on outside click", "the counter resets on re-render", "API calls are duplicated on mount", "the form submits empty values"],
    "error_message": ["Cannot read property 'map' of undefined", "Maximum call stack size exceeded", "Cannot find module './styles.css'", "Invalid date format: received 'undefined'", "Property 'id' does not exist on type 'never'"],
    "condition": ["the user is not authenticated", "the API returns a 429 rate limit error", "the network is offline", "the data array is empty", "the prop is not provided"],
    "scenario": ["two parallel requests update the same cache key", "a WebSocket message arrives mid-state-update", "the component unmounts before an async callback completes"],
    "what_to_do": ["extract the validation logic into a separate utility file", "replace callback props with an event emitter pattern", "split the mega-component into smaller focused components", "move inline styles to CSS modules", "replace switch statements with a lookup map"],
    "old_pattern": ["callback", "class component", "switch statement", "inline style", "prop drilling"],
    "new_pattern": ["async/await", "functional component", "strategy pattern", "CSS module", "context API"],
    "logic_description": ["the debounced search logic", "the form validation rules", "the pagination state machine", "the sort/filter pipeline"],
    "old_name": ["IUserData", "IConfigOptions", "IApiResponse", "IAppState"],
    "new_name": ["UserProfile", "AppConfiguration", "ApiResult", "ApplicationStore"],
    "test_cases": ["happy path, empty state, error state, loading state", "boundary values, null inputs, type validation", "success callback, error callback, timeout handling"],
    "endpoint": ["POST /api/orders", "GET /api/users/:id", "PUT /api/settings", "DELETE /api/sessions"],
    "scenarios": ["authentication, authorization, rate limiting", "CRUD operations, pagination, filtering"],
    "review_focus": ["potential memory leaks and performance issues", "accessibility violations and UX antipatterns", "security vulnerabilities (XSS, injection)", "type safety and edge case handling"],
    "tool_name": ["ESLint", "Prettier", "Jest", "TypeScript", "Tailwind CSS", "Storybook"],
    "requirements": ["strict TypeScript rules, no any types", "2-space indentation, single quotes, trailing commas", "80% coverage threshold, setup files included"],
    "bottleneck_description": ["a slow O(n) algorithm in the data processing pipeline", "unnecessary re-renders caused by missing memoization", "large bundle size from unused imports"],
    "improvement_goal": ["reduce processing time by 50%", "cut re-renders by 80%", "reduce bundle size by 30%"],
    "vuln_type": ["XSS (cross-site scripting)", "SQL injection", "path traversal", "insecure deserialization"],
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def fill_template(template: dict[str, Any]) -> dict[str, Any]:
    """Fill a template with random vocabulary."""
    prompt = template["prompt"]
    for key, values in VOCAB.items():
        placeholder = "{" + key + "}"
        if placeholder in prompt:
            prompt = prompt.replace(placeholder, random.choice(values), 1)
    return {"type": template["type"], "prompt": prompt, "complexity": template["complexity"]}


def is_valid_suny_format(text: str) -> bool:
    """Check that the generated text uses SUNy's XML tool-call format."""
    has_tool_call = "<tool_call>" in text
    has_tool_result = "<tool_result>" in text
    has_reasoning = "<reasoning>" in text
    # Must have at least tool_call + tool_result + reasoning to be valid
    return has_tool_call and has_tool_result and has_reasoning


def generate_with_retry(
    client: OpenAI,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_retries: int = 2,
) -> str | None:
    """Generate a SUNy conversation, retrying if format is invalid."""
    for attempt in range(max_retries + 1):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.5 if attempt == 0 else 0.3,  # Lower temp on retry for more deterministic output
                max_tokens=6144,
            )
            content = resp.choices[0].message.content
            if not content:
                continue

            if is_valid_suny_format(content):
                return content

        except Exception:
            continue

    return None


# ─── Generator Functions ──────────────────────────────────────────────────────

BASE_PROMPT = """You are simulating SUNy completing a real coding task. Your response MUST use SUNy's format — study this example carefully and match its structure EXACTLY:

{example}

---
Now generate a NEW conversation for this task. Follow the same format with <reasoning>, <tool_call>, and <tool_result> tags.

TASK: {task_prompt}
TYPE: {task_type}
COMPLEXITY: {complexity}

{complexity_guide}

IMPORTANT RULES (do not violate):
1. Use <reasoning> for all thinking — never use markdown headings like **PLAN** or **INTENT_PARSE**
2. Use <tool_call> with JSON arguments for every action — tool names: read_file, write_file, edit_file, bash, search_code, run_lint, run_test
3. Use <tool_result> for every tool response
4. Show at least one VERIFICATION step (run_lint or run_test)
5. End with a FINALIZE reasoning block summarizing what was done
6. Do NOT include markdown code blocks (```)
7. Do NOT use **bold** or markdown headings
8. Each conversation must be self-contained and complete"""

COMPLEXITY_GUIDES = {
    "easy": "COMPLEXITY GUIDE: Keep it focused. 2-4 tool calls. One file change. Brief summary.",
    "medium": "COMPLEXITY GUIDE: Complete solution. 4-8 tool calls. Multiple files if needed. Show verification.",
    "hard": "COMPLEXITY GUIDE: Thorough solution. 6-12 tool calls. Multiple files. Show error handling and retry if applicable.",
}


def generate_conversation(
    task: dict[str, Any],
    client: OpenAI,
    model: str,
    type_label: str,
    extra_guidance: str = "",
) -> dict[str, Any] | None:
    """Generate a single SUNy conversation with format validation and retry."""
    user_prompt = BASE_PROMPT.format(
        example=FEW_SHOT_EXAMPLE.strip(),
        task_prompt=task["prompt"],
        task_type=type_label,
        complexity=task["complexity"].upper(),
        complexity_guide=COMPLEXITY_GUIDES.get(task["complexity"], ""),
    )

    if extra_guidance:
        user_prompt += f"\n\nADDITIONAL GUIDANCE: {extra_guidance}"

    content = generate_with_retry(client, model, SYSTEM_PROMPT, user_prompt)
    if not content:
        return None

    return {
        "id": str(uuid.uuid4()),
        "task_type": task["type"],
        "complexity": task["complexity"],
        "conversations": [
            {"from": "human", "value": task["prompt"]},
            {"from": "gpt", "value": content},
        ],
    }


# ─── Task-specific guidance overrides ─────────────────────────────────────────

TYPE_GUIDANCE = {
    "bug": "Focus on: reading the error, analyzing root cause, applying the fix, verifying with lint/tests.",
    "refactor": "Focus on: reading current code, planning safe changes, executing incrementally, verifying nothing broke.",
    "test": "Focus on: reading the source, understanding test patterns, writing tests, running them, fixing failures.",
    "review": "Focus on: reading the file, analyzing issues, providing structured feedback in reasoning blocks.",
    "docs": "Focus on: reading exported symbols, adding JSDoc inline, verifying with lint.",
    "config": "Focus on: reading existing config, making changes, verifying the tool works.",
    "perf": "Focus on: profiling or reading the bottleneck, implementing optimization, measuring improvement.",
    "security": "Focus on: reading for vulnerabilities, applying fixes, verifying with lint/tests.",
}


# ─── Main generation loop ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate SUNy synthetic training data")
    parser.add_argument("--count", type=int, default=1200, help="Number of examples to generate")
    parser.add_argument("--output", type=str, default="./suny-training-data.jsonl", help="Output JSONL path")
    parser.add_argument("--model", type=str, default="llama-3.3-70b-versatile", help="LLM for generation (uses Groq/OpenAI)")
    parser.add_argument("--workers", type=int, default=4, help="Parallel workers")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    random.seed(args.seed)
    client = OpenAI(
        api_key=os.environ.get("OPENAI_API_KEY") or os.environ.get("GROQ_API_KEY"),
        base_url=os.environ.get("OPENAI_BASE_URL", "https://api.groq.com/openai/v1"),
    )

    TYPE_WEIGHTS = {
        "feature": 0.25,
        "bug": 0.20,
        "refactor": 0.15,
        "test": 0.12,
        "docs": 0.08,
        "review": 0.06,
        "config": 0.06,
        "perf": 0.04,
        "security": 0.04,
    }
    COMPLEXITY_WEIGHTS = {"easy": 0.20, "medium": 0.50, "hard": 0.30}

    examples: list[dict[str, Any]] = []
    tasks: list[dict[str, Any]] = []

    for _ in range(args.count):
        t = random.choices(list(TYPE_WEIGHTS.keys()), weights=list(TYPE_WEIGHTS.values()))[0]
        complexity = random.choices(list(COMPLEXITY_WEIGHTS.keys()), weights=list(COMPLEXITY_WEIGHTS.values()))[0]
        candidates = [tmpl for tmpl in TASK_TEMPLATES if tmpl["type"] == t]
        if not candidates:
            candidates = [tmpl for tmpl in TASK_TEMPLATES if tmpl["type"] == "feature"]
        template = random.choice(candidates)
        template["complexity"] = complexity
        tasks.append(fill_template(template))

    print(f"Generating {len(tasks)} examples with {args.workers} workers...")
    print(f"  Model: {args.model}")
    print(f"  Format: XML tool-call (validated + retry)")
    print(f"Task distribution:")
    for t_type in TYPE_WEIGHTS:
        count = sum(1 for t in tasks if t["type"] == t_type)
        print(f"  {t_type}: {count}")
    print()

    completed = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {}
        for task in tasks:
            gen_fn = generate_conversation
            guidance = TYPE_GUIDANCE.get(task["type"], "")
            futures[executor.submit(gen_fn, task, client, args.model, task["type"].upper(), guidance)] = task

        with tqdm(total=len(futures)) as pbar:
            for future in as_completed(futures):
                task = futures[future]
                try:
                    result = future.result()
                    if result:
                        examples.append(result)
                        pbar.set_postfix({"ok": len(examples), "fail": failed})
                    else:
                        failed += 1
                        pbar.set_postfix({"ok": len(examples), "fail": failed})
                except Exception as e:
                    failed += 1
                    pbar.set_postfix({"ok": len(examples), "fail": failed})
                    print(f"  Failed task {task['type']}: {e}")

                completed += 1
                pbar.update(1)

    with open(args.output, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    print(f"\n{'='*60}")
    print(f"Generation complete!")
    print(f"  Total attempts: {args.count}")
    print(f"  Successful: {len(examples)}")
    print(f"  Failed (no valid format after retry): {failed}")
    print(f"  Output: {args.output}")

    type_counts: dict[str, int] = {}
    for ex in examples:
        t = ex.get("task_type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1
    print(f"\n  Type distribution:")
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"    {t}: {c}")

    complexity_counts: dict[str, int] = {}
    for ex in examples:
        c = ex.get("complexity", "unknown")
        complexity_counts[c] = complexity_counts.get(c, 0) + 1
    print(f"\n  Complexity distribution:")
    for c in ["easy", "medium", "hard"]:
        print(f"    {c}: {complexity_counts.get(c, 0)}")


if __name__ == "__main__":
    main()
