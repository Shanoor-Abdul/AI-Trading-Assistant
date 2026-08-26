
with open("src/lib/ai/providers/anthropic.ts", "r") as f:
    content = f.read()

content = content.replace("max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 8192, 8192),", "max_tokens: currentModel.includes(\"sonnet\") || currentModel.includes(\"3-7\") ? 16384 : 8192,")

with open("src/lib/ai/providers/anthropic.ts", "w") as f:
    f.write(content)

