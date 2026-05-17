import json

with open('suny-training-data.jsonl', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f'Total lines: {len(lines)}')

# Check first 5 lines
for i in range(min(5, len(lines))):
    line = lines[i].strip()
    try:
        d = json.loads(line)
        print(f'Line {i}: OK - type={d["task_type"]} len={len(line)}')
    except json.JSONDecodeError as e:
        print(f'Line {i}: ERROR - {e}')
        print(f'  Position {e.pos}: ...{line[max(0,e.pos-40):e.pos+40]}...')

# Check last 3 lines
print()
for i in range(max(0, len(lines)-3), len(lines)):
    line = lines[i].strip()
    try:
        d = json.loads(line)
        print(f'Line {i}: OK - type={d["task_type"]} len={len(line)}')
    except json.JSONDecodeError as e:
        print(f'Line {i}: ERROR - {e}')

# Check encoding
print(f'\nEncoding check:')
print(f'  First line starts with bytes: {lines[0][:20].encode("utf-8")}')

# Check for BOM or extra characters
print(f'  First char ord: {ord(lines[0][0])}')
print(f'  Last char ord (last line): {ord(lines[-1][-1])}')

# Re-write the file cleanly to ensure no encoding issues
print(f'\nRewriting file with clean UTF-8...')
with open('suny-training-data.jsonl', 'r', encoding='utf-8') as f:
    content = f.read()

with open('suny-training-data.jsonl', 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print('Done - file rewritten cleanly')
