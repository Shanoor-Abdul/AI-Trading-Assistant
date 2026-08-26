
with open("src/lib/ai/providers/openrouter.ts", "r") as f:
    content = f.read()

content = content.replace("max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 6000, 4000),", "max_tokens: model.includes(\"sonnet\") ? 16384 : 8192,")

with open("src/lib/ai/providers/openrouter.ts", "w") as f:
    f.write(content)

