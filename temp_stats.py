import json

with open('suny-training-data.jsonl', 'r', encoding='utf-8') as f:
    lines = f.readlines()

total = len(lines)
has_intent = 0
has_plan = 0
has_exec = 0
has_verify = 0
has_finalize = 0
has_tool_tag = 0
all_5_stages = 0

for line in lines:
    d = json.loads(line)
    gpt = d['conversations'][1]['value']
    
    # Check sections
    gpt_upper = gpt.upper()
    if 'INTENT_PARSE' in gpt or 'INTENT PARSE' in gpt_upper:
        has_intent += 1
    if 'PLAN' in gpt_upper:
        has_plan += 1
    if 'EXECUTION' in gpt_upper:
        has_exec += 1
    if 'VERIFICATION' in gpt_upper:
        has_verify += 1
    if 'FINALIZE' in gpt_upper:
        has_finalize += 1
    if '<tool_call>' in gpt:
        has_tool_tag += 1
    
    # Check for all 5 stages
    stages = ['INTENT_PARSE', 'INTENT PARSE', 'PLAN', 'EXECUTION', 'VERIFICATION', 'FINALIZE']
    found = sum(1 for s in stages if s in gpt_upper)
    if found >= 5:
        all_5_stages += 1

print(f'Total examples: {total}')
print(f'Has INTENT_PARSE: {has_intent} ({has_intent/total*100:.0f}%)')
print(f'Has PLAN:        {has_plan} ({has_plan/total*100:.0f}%)')
print(f'Has EXECUTION:   {has_exec} ({has_exec/total*100:.0f}%)')
print(f'Has VERIFICATION: {has_verify} ({has_verify/total*100:.0f}%)')
print(f'Has FINALIZE:    {has_finalize} ({has_finalize/total*100:.0f}%)')
print(f'Has XML tool tags: {has_tool_tag} ({has_tool_tag/total*100:.0f}%)')
print(f'All 5+ stages:   {all_5_stages} ({all_5_stages/total*100:.0f}%)')

# Sample distribution
types = {}
for line in lines:
    d = json.loads(line)
    t = d['task_type']
    types[t] = types.get(t, 0) + 1
print(f'\nType distribution:')
for t, c in sorted(types.items(), key=lambda x: -x[1]):
    print(f'  {t}: {c}')
