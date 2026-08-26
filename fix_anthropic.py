import re

with open("src/lib/ai/providers/anthropic.ts", "r") as f:
    content = f.read()

content = content.replace("bool(req.promptOverride)", "Boolean(req.promptOverride)")

with open("src/lib/ai/providers/anthropic.ts", "w") as f:
    f.write(content)
