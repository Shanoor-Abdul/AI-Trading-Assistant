
with open("src/lib/ai/providers/anthropic.ts", "r") as f:
    content = f.read()

content = content.replace("if (response.stop_reason === 'content_filter'", "if (String(response.stop_reason) === 'content_filter'")

with open("src/lib/ai/providers/anthropic.ts", "w") as f:
    f.write(content)

