# SUNy Training — Easy Step-by-Step Plan

> **What you already have:** `suny-training-data-v3.jsonl` — 2,000 examples (380 expert-tier) ✅

---

## 📋 The Big Picture — What We're Building

We're teaching SUNy to be **really smart** at coding tasks. Each step below makes it better.

---

## 🎯 Phase 1: Build a Benchmark (takes ~1 hour)

**Goal:** Create a test to measure if SUNy is getting better.

### What to do:

1. **Open Google Colab** → https://colab.research.google.com
2. **Upload this file:** `docs/SUNy_FineTune_Colab.ipynb`
3. **Run Cell 1.1 and 1.2** — installs Unsloth and connects your Google Drive
4. **Run Cell 7 (Test Section)** — this runs 10 test prompts through the model and checks:
   - Does it use XML tags correctly? (`<reasoning>`, `<tool_call>`)
   - Does it follow the 5-stage pipeline?
   - Does it self-correct if lint fails?

5. **Save the results** — this is your "before" score. Later you'll compare.

---

## 🎯 Phase 2: First Re-Training (takes ~2-3 hours on Colab)

**Goal:** Retrain SUNy on the new v3 data with expert examples.

### What to do:

1. **Upload `suny-training-data-v3.jsonl` to Google Drive**
   - Go to drive.google.com
   - Upload the file to a folder (e.g., `SUNy/`)
   - Right-click → "Get link" → Copy the file ID

2. **In the Colab notebook**, update Cell 3 to load v3 data instead of v2:
   - Change the file path to point to `suny-training-data-v3.jsonl`
   - Or just upload it directly to the Colab runtime

3. **Run Cells 2-6** in order:
   - **Cell 2:** Load Qwen3.5 9B in 4-bit mode
   - **Cell 3:** Load the v3 training data (2,000 examples)
   - **Cell 4:** Format data for Unsloth
   - **Cell 5:** Train! (this takes ~1.5-2 hours on T4 GPU)
   - **Cell 5.3:** Upload to Hugging Face

4. **Run Cell 7 again** — compare the new "after" score with your "before" score

> **Expected:** You'll see ~10-15% improvement on hard tasks and new ability to handle architecture-level tasks.

---

## 🎯 Phase 3: DPO Training (takes ~2-3 hours)

**Goal:** Teach SUNy what NOT to do, not just what to do.

### What to do:

1. **Create preference pairs** — for each training example, generate a "good" version and a "bad" version:
   - Open `scripts/generate-suny-training-data.py`
   - Run with `--temperature 0.3` for the good version
   - Run with `--temperature 0.9` for the bad version
   - Use the LLM judge (same as `training-scorer.ts`) to score both
   - Keep pairs where the score gap is >15 points

2. **Upload preference data to Colab**
3. **Use the DPO Trainer in Unsloth** (adds ~4 lines of code to the notebook)
4. **Run training** — 1 epoch, LR=5e-6
5. **Test again** — check if the model avoids bad behaviors

---

## 🎯 Phase 4: Curriculum Training (takes ~4-5 hours)

**Goal:** Train step-by-step from easy to hard, like school.

### What to do:

1. **Split the v3 data into 5 files:**
   - `stage1-easy.jsonl` (178 examples)
   - `stage2-medium.jsonl` (707 examples)
   - `stage3-hard.jsonl` (735 examples)
   - `stage4-expert.jsonl` (380 examples)
   - `stage5-mixed.jsonl` (all 2,000)

2. **Train in sequence:**
   - Load base Qwen model
   - Train on stage 1 → save checkpoint
   - Load checkpoint → train on stage 2 → save checkpoint
   - Load checkpoint → train on stage 3 → save checkpoint
   - Load checkpoint → train on stage 4 → save checkpoint
   - Load checkpoint → train on stage 5 → save final model

3. **Upload to Hugging Face** as `SUNy-Qwen-Curriculum-v2`

---

## 🎯 Phase 5: GRPO (Like DeepSeek-R1) (takes ~3-4 hours)

**Goal:** Use DeepSeek-R1's technique to make SUNy reason better.

### What to do:

1. **For each training prompt, generate 4 responses** at different temperatures
2. **Score all 4** using the LLM judge
3. **Train the model** to prefer higher-scoring responses
4. **This is the "secret sauce"** — it's what made DeepSeek-R1 so powerful

I'll help you add the GRPO loss code to the Colab notebook when you're ready.

---

## 🎯 Phase 6: Adversarial Training (takes ~2-3 hours)

**Goal:** Make SUNy resistant to tricky/confusing requests.

### What to do:

1. **Generate 200 "tricky" prompts:**
   - Impossible requests ("make this work without a server")
   - Vague requests ("fix it")
   - Contradictory requests ("add pagination but show all data")
   - Hallucination bait ("update the nonexistent-module")

2. **Have SUNy try to answer them** — it will fail on most
3. **Write the correct answers** for each
4. **Train SUNy on these** — now it knows how to handle trick questions

---

## 🎯 Phase 7: Deployment Optimization (takes ~1-2 hours)

**Goal:** Make SUNy run fast and cheap.

### What to do:

1. **Convert to AWQ format** — keeps quality but runs 3x faster
2. **Enable speculative decoding** — use a tiny model (0.5B) to predict tokens, SUNy (9B) just verifies them → 2-3x speedup
3. **Deploy to HF Serverless** — uses your existing credits, no hourly fee
4. **Test response time** — should be under 3 seconds per query

---

## 📅 Suggested Schedule

| Day | What to Do | Time Needed |
|-----|-----------|-------------|
| **Day 1** | Phase 1 (Benchmark) + Phase 2 (Re-training) | ~3-4 hours |
| **Day 2** | Phase 3 (DPO) + Phase 4 (Curriculum Stage 1-2) | ~3-4 hours |
| **Day 3** | Phase 4 (Curriculum Stage 3-5) + Phase 5 (GRPO) | ~4-5 hours |
| **Day 4** | Phase 6 (Adversarial) + Phase 7 (Optimize) | ~3-4 hours |

**Total: ~4 days of Colab runs, ~$0 cost (all on free tier)**

---

## 🔧 Quick Reference: Useful Commands

### To generate more data (anytime)
```bash
python scripts/generate-suny-training-data.py --count 500 --output ./extra-data.jsonl
```

### To check your data
```bash
python -c "
import json
c=0; t={}; cx={}
with open('suny-training-data-v3.jsonl', encoding='utf-8') as f:
    for line in f:
        if line.strip():
            o=json.loads(line); c+=1
            t[o.get('task_type')]=t.get(o.get('task_type'),0)+1
            cx[o.get('complexity')]=cx.get(o.get('complexity'),0)+1
print(f'Total: {c}')
print(f'Types: {t}')
print(f'Complexity: {cx}')
"
```

### To upload new model to Hugging Face
```python
# In Colab Cell 5.3
model.push_to_hub("Galaxy-Ai-Bot/SUNy-Qwen-v3", token=hf_token)
tokenizer.push_to_hub("Galaxy-Ai-Bot/SUNy-Qwen-v3", token=hf_token)
```

---

## ❓ When to Ask Me for Help

- **Before each phase** — I'll update the Colab notebook with the right code
- **If a Colab run crashes** — I'll help debug
- **If scores don't improve** — I'll help figure out why
- **When you want to deploy** — I'll help set up HF Serverless

---

## 🏁 End State

After all 7 phases, SUNy will:
- ✅ Handle architecture-level tasks (multi-tenant DB, microservices, RBAC)
- ✅ Self-correct on lint/test failures (90%+)
- ✅ Handle trick questions without hallucinating
- ✅ Run 3x faster with AWQ quantization
- ✅ Cost $0/month on HF Serverless credits
- ✅ Perform close to GPT-4 level on coding tasks
