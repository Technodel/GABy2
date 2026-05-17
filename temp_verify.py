import json, os

size = os.path.getsize('suny-training-data.jsonl')
print(f'File size: {size/1024**2:.1f} MB')

with open('suny-training-data.jsonl', 'r', encoding='utf-8') as f:
    lines = f.readlines()
print(f'Total examples: {len(lines)}')

for i in [0, len(lines)//2, len(lines)-1]:
    d = json.loads(lines[i])
    print(f'\n--- Example {i} ---')
    print(f'Type: {d["task_type"]}, Complexity: {d["complexity"]}')
    h = d['conversations'][0]['value']
    print(f'Human: {h[:100]}...')
    gpt = d['conversations'][1]['value']
    print(f'GPT length: {len(gpt)} chars')
    has_tc = '<tool_call>' in gpt or '<tool_result>' in gpt
    has_plan = 'PLAN' in gpt[:300].lower()
    print(f'Has tool calls: {has_tc}')
    print(f'Has plan section: {has_plan}')

print('\nDone!')
