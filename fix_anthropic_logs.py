
with open("src/lib/ai/providers/anthropic.ts", "r") as f:
    content = f.read()

content = content.replace("require('fs').writeFileSync('anthropic_debug.json', JSON.stringify(response, null, 2));", "require('fs').writeFileSync(req.rawOutput ? 'anthropic_stage1_debug.json' : 'anthropic_stage2_debug.json', JSON.stringify(response, null, 2));")

with open("src/lib/ai/providers/anthropic.ts", "w") as f:
    f.write(content)

