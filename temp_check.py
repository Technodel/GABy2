import json

with open('suny-training-data.jsonl', 'r', encoding='utf-8') as f:
    line = f.readline()
    d = json.loads(line)
    gpt = d['conversations'][1]['value']
    print(gpt[:1500])
    print('\n...')
    print(gpt[-500:])
