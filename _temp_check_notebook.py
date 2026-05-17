import json
with open('docs/SUNy_FineTune_Colab.ipynb', encoding='utf-8') as f:
    nb = json.load(f)
print(f'Cells: {len(nb["cells"])}')
print('Valid JSON: OK')

# Find benchmark cell
for i, cell in enumerate(nb['cells']):
    src = ''.join(cell.get('source', []))
    if 'BENCHMARK SUITE' in src:
        print(f'Benchmark cell at index {i}')
        print(f'  xml_compliance prompts: {src.count("xml_compliance")}')
        print(f'  pipeline prompts: {src.count("pipeline_completeness")}')
        print(f'  safety prompts: {src.count("hallucination_safety")}')
        break

# Verify standalone benchmark script
with open('scripts/suny-benchmark.py', encoding='utf-8') as f:
    content = f.read()
benches = ['xml_compliance', 'pipeline_completeness', 'execution_accuracy', 'self_correction', 'hallucination_safety']
for b in benches:
    count = content.count(b)
    print(f'Standalone script - {b}: {count} mentions')
print('Both files valid!')
