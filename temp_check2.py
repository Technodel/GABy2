import json

lines = open('suny-training-data-v2-test.jsonl', 'r', encoding='utf-8').readlines()
print('Total:', len(lines))

all_valid = True
for i in range(len(lines)):
    d = json.loads(lines[i])
    gpt = d['conversations'][1]['value']
    has_tc = '<tool_call>' in gpt
    has_tr = '<tool_result>' in gpt
    has_r = '<reasoning>' in gpt
    has_intent = 'INTENT_PARSE' in gpt
    has_finalize = 'FINALIZE' in gpt
    valid = has_tc and has_tr and has_r
    if not valid:
        all_valid = False
    print(f'#{i}: type={d["task_type"]} tc={has_tc} tr={has_tr} r={has_r} intent={has_intent} final={has_finalize} valid={valid} len={len(gpt)}')

print(f'\nAll valid: {all_valid}')

# Show a sample
if all_valid:
    d = json.loads(lines[0])
    print('\n--- Sample GPT output (first 800 chars) ---')
    print(d['conversations'][1]['value'][:800])
