#!/usr/bin/env python3
"""
SUNy Master Merge Script — Run on Colab or any machine with internet.

Merges multiple SUNy fine-tunes + public coding experts into one super-model.

Usage:
  python scripts/suny-merge-master.py --hf-token YOUR_TOKEN
"""

import argparse
import json
import os
import subprocess
import sys
import time


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

MODELS = {
    # Our own SUNy models
    "suny_v2": "Galaxy-Ai-Bot/SUNy-Qwen-Merged",
    "suny_v3": "Galaxy-Ai-Bot/SUNy-Qwen-v3-Merged",  # Will be created by Colab

    # Public coding experts (best matches for SUNy behavior)
    "opencodeinterpreter": "m-a-p/OpenCodeInterpreter-DS-6.7B",
    "magicoder": "ise-uiuc/Magicoder-S-DS-6.7B",
    "wavecoder": "microsoft/WaveCoder-Ultra-6.7B",
    "deepseek_coder": "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
}

# ═══════════════════════════════════════════════════════════════════════════════
# MERGE STEP 1 — SUNy v2 + v3 (same base model = simple merge)
# ═══════════════════════════════════════════════════════════════════════════════

STEP1_CONFIG = """
# Merge SUNy v2 (1200 examples) + v3 (2000 examples, expert tier)
# Both based on Qwen 9B - simple linear merge
slices:
  - sources:
      - model: {v2_model}
        layer_range: [0, 32]
      - model: {v3_model}
        layer_range: [0, 32]
merge_method: linear
base_model: {base_model}
parameters:
  weight: 0.3  # v2 gets 30%, v3 gets 70% (v3 has more data)
tokenizer_source: base
dtype: bfloat16
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MERGE STEP 2 — SUNy Combined + Public Coding Expert
# ═══════════════════════════════════════════════════════════════════════════════

STEP2_TIES_CONFIG = """
# Merge SUNy Combined + OpenCodeInterpreter (6.7B)
# Different architectures, so we use TIES merging
# TIES works by trimming small weights, resolving sign conflicts, then merging
slices:
  - sources:
      - model: {suny_combined}
      - model: m-a-p/OpenCodeInterpreter-DS-6.7B
merge_method: ties
base_model: {base_model}
parameters:
  density: 0.5      # Keep top 50% of weights from each
  normalize: true   # Normalize before merging
  int8_mask: true   # Use int8 for memory efficiency
tokenizer_source: union
dtype: bfloat16
"""

STEP2_DARE_CONFIG = """
# Alternative: DARE merge (Drop And REscale)
# Good for different-architecture models
slices:
  - sources:
      - model: {suny_combined}
        parameters:
          weight: 0.7   # SUNy gets 70%
      - model: m-a-p/OpenCodeInterpreter-DS-6.7B
        parameters:
          weight: 0.3   # Expert gets 30%
merge_method: dare_linear
base_model: {base_model}
parameters:
  density: 0.4
  epsilon: 0.01
tokenizer_source: union
dtype: bfloat16
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MERGE STEP 3 — Multi-Model Fusion (SUNy + 3 coding experts)
# ═══════════════════════════════════════════════════════════════════════════════

STEP3_MULTI_CONFIG = """
# Multi-model fusion: SUNy + 3 coding experts
# Uses DARE to blend 4 models together
slices:
  - sources:
      - model: {suny_combined}
        parameters:
          weight: 0.55   # SUNy behavior dominates
      - model: m-a-p/OpenCodeInterpreter-DS-6.7B
        parameters:
          weight: 0.20   # Code execution + iteration
      - model: ise-uiuc/Magicoder-S-DS-6.7B
        parameters:
          weight: 0.15   # General coding + tool use
      - model: microsoft/WaveCoder-Ultra-6.7B
        parameters:
          weight: 0.10   # Code testing + generation
merge_method: dare_linear
base_model: {base_model}
parameters:
  density: 0.3
  epsilon: 0.05
tokenizer_source: union
dtype: bfloat16
"""


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def run_cmd(cmd, desc=None):
    """Run a shell command and print output."""
    if desc:
        print(f"\n{'='*60}")
        print(f"  {desc}")
        print(f"{'='*60}")
    print(f"  $ {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
    if result.stderr:
        # mergekit prints progress to stderr
        print(result.stderr[-2000:] if len(result.stderr) > 2000 else result.stderr)
    if result.returncode != 0:
        print(f"  ⚠️  Exit code: {result.returncode}")
    return result.returncode == 0


def write_config(filename, template, **kwargs):
    """Write a merge config YAML file."""
    content = template.format(**kwargs).strip()
    with open(filename, 'w') as f:
        f.write(content + '\n')
    print(f"  Created: {filename}")
    return filename


def check_model_exists(hf_token, model_name):
    """Check if a model exists on Hugging Face."""
    import requests
    headers = {"Authorization": f"Bearer {hf_token}"}
    api_url = f"https://huggingface.co/api/models/{model_name}"
    try:
        r = requests.get(api_url, headers=headers, timeout=10)
        return r.status_code == 200
    except:
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="SUNy Master Merge Script")
    parser.add_argument("--hf-token", required=True, help="Hugging Face token")
    parser.add_argument("--step", choices=["1", "2", "3", "all"], default="all",
                        help="Which merge step to run")
    parser.add_argument("--v3-model", default="Galaxy-Ai-Bot/SUNy-Qwen-v3-Merged",
                        help="Your new v3 model name on HF")
    parser.add_argument("--base-model", default="unsloth/Qwen3.5-9B-Instruct-bnb-4bit",
                        help="Base model for merge")
    parser.add_argument("--output-dir", default="/content/suny-merged-final",
                        help="Output directory")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    hf_token = args.hf_token
    base_model = args.base_model
    v3_model = args.v3_model
    v2_model = MODELS["suny_v2"]

    print(f"\n{'='*60}")
    print(f"  SUNy MASTER MERGE ENGINE")
    print(f"{'='*60}")
    print(f"\n  Checking models exist on Hugging Face...")

    models_to_check = [v2_model, v3_model]
    if args.step in ["2", "3", "all"]:
        models_to_check.extend([
            MODELS["opencodeinterpreter"],
            MODELS["magicoder"],
            MODELS["wavecoder"],
        ])

    for m in models_to_check:
        exists = check_model_exists(hf_token, m)
        status = "✅ Found" if exists else "❌ Not found"
        print(f"  {status}: {m}")

    # ── STEP 1: Merge SUNy v2 + v3 ──────────────────────────────────────────
    if args.step in ["1", "all"]:
        step1_out = os.path.join(args.output_dir, "step1-suny-combined")
        cfg = write_config(
            "/content/merge-step1.yml", STEP1_CONFIG,
            v2_model=v2_model, v3_model=v3_model, base_model=base_model
        )

        success = run_cmd(
            f"mergekit-yaml /content/merge-step1.yml {step1_out} "
            f"--write-model-card --allow-crimes --copy-tokenizer --trust-remote-code "
            f"--clone-tensorflow --lazy-unpickle --low-cpu-memory 2>&1",
            desc="STEP 1: Merging SUNy v2 (30%) + v3 (70%)"
        )

        if success:
            print(f"\n  ✅ Step 1 complete: {step1_out}")

            # Push to HF
            push_cmd = (
                f"huggingface-cli upload Galaxy-Ai-Bot/SUNy-Combined-v2v3 {step1_out}/. "
                f"--token {hf_token} --repo-type model 2>&1"
            )
            run_cmd(push_cmd, desc="Uploading SUNy Combined to Hugging Face")

            print(f"\n  ✅ Uploaded: https://huggingface.co/Galaxy-Ai-Bot/SUNy-Combined-v2v3")
        else:
            print(f"\n  ❌ Step 1 failed. Check errors above.")
            return

    # ── STEP 2: Merge SUNy Combined + OpenCodeInterpreter ───────────────────
    if args.step in ["2", "all"]:
        suny_combined = "Galaxy-Ai-Bot/SUNy-Combined-v2v3"
        step2_out = os.path.join(args.output_dir, "step2-suny-plus-opencode")

        # Try TIES first (better quality but needs more memory)
        cfg = write_config(
            "/content/merge-step2.yml", STEP2_TIES_CONFIG,
            suny_combined=suny_combined, base_model=base_model
        )

        success = run_cmd(
            f"mergekit-yaml /content/merge-step2.yml {step2_out} "
            f"--write-model-card --allow-crimes --copy-tokenizer --trust-remote-code "
            f"--clone-tensorflow --lazy-unpickle --low-cpu-memory 2>&1",
            desc="STEP 2: Merging SUNy Combined + OpenCodeInterpreter (TIES)"
        )

        if not success:
            print(f"\n  TIES merge failed. Falling back to DARE linear...")
            cfg = write_config(
                "/content/merge-step2-dare.yml", STEP2_DARE_CONFIG,
                suny_combined=suny_combined, base_model=base_model
            )
            success = run_cmd(
                f"mergekit-yaml /content/merge-step2-dare.yml {step2_out} "
                f"--write-model-card --allow-crimes --copy-tokenizer --trust-remote-code "
                f"--clone-tensorflow --lazy-unpickle --low-cpu-memory 2>&1",
                desc="STEP 2 (fallback): Merging SUNy Combined + OpenCodeInterpreter (DARE)"
            )

        if success:
            print(f"\n  ✅ Step 2 complete: {step2_out}")

            push_cmd = (
                f"huggingface-cli upload Galaxy-Ai-Bot/SUNy-v2v3-OpenCode {step2_out}/. "
                f"--token {hf_token} --repo-type model 2>&1"
            )
            run_cmd(push_cmd, desc="Uploading SUNy + OpenCode to Hugging Face")
            print(f"\n  ✅ Uploaded: https://huggingface.co/Galaxy-Ai-Bot/SUNy-v2v3-OpenCode")
        else:
            print(f"\n  ❌ Step 2 failed.")
            return

    # ── STEP 3: Multi-Model Fusion (SUNy + 3 experts) ──────────────────────
    if args.step in ["3", "all"]:
        suny_combined = "Galaxy-Ai-Bot/SUNy-Combined-v2v3"
        step3_out = os.path.join(args.output_dir, "step3-suny-multi-fusion")

        cfg = write_config(
            "/content/merge-step3.yml", STEP3_MULTI_CONFIG,
            suny_combined=suny_combined, base_model=base_model
        )

        success = run_cmd(
            f"mergekit-yaml /content/merge-step3.yml {step3_out} "
            f"--write-model-card --allow-crimes --copy-tokenizer --trust-remote-code "
            f"--clone-tensorflow --lazy-unpickle --low-cpu-memory 2>&1",
            desc="STEP 3: Multi-Model Fusion — SUNy + OpenCodeInterpreter + Magicoder + WaveCoder"
        )

        if success:
            print(f"\n  ✅ Step 3 complete: {step3_out}")

            push_cmd = (
                f"huggingface-cli upload Galaxy-Ai-Bot/SUNy-Mega-Merged {step3_out}/. "
                f"--token {hf_token} --repo-type model 2>&1"
            )
            run_cmd(push_cmd, desc="Uploading SUNy Mega Merged to Hugging Face")
            print(f"\n  ✅ Uploaded: https://huggingface.co/Galaxy-Ai-Bot/SUNy-Mega-Merged")
        else:
            print(f"\n  ❌ Step 3 failed.")

    print(f"\n{'='*60}")
    print(f"  MERGE PIPELINE COMPLETE")
    print(f"{'='*60}")
    if args.step in ["1", "all"]:
        print(f"  ✅ SUNy v2+v3 Combined:  Galaxy-Ai-Bot/SUNy-Combined-v2v3")
    if args.step in ["2", "all"]:
        print(f"  ✅ + OpenCodeInterpreter: Galaxy-Ai-Bot/SUNy-v2v3-OpenCode")
    if args.step in ["3", "all"]:
        print(f"  ✅ Mega Merged (4 models): Galaxy-Ai-Bot/SUNy-Mega-Merged")
    print(f"\n  Next: Run the benchmark on each to compare scores!")


if __name__ == "__main__":
    main()
