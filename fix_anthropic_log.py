import re

with open("src/lib/ai/providers/anthropic.ts", "r") as f:
    content = f.read()

content = content.replace("content.push({ type: \"text\", text: prompt });", "content.push({ type: \"text\", text: prompt });\n  try { require(\"fs\").writeFileSync(\"anthropic_prompt.txt\", prompt); } catch(e){}")

with open("src/lib/ai/providers/anthropic.ts", "w") as f:
    f.write(content)
