
with open("src/lib/ai/providers/anthropic.ts", "r") as f:
    content = f.read()

replacement = """      const maxTokens = currentModel.includes("sonnet-5") || currentModel.includes("3-7") ? 16384 : 8192;
      const response = await anthropic.messages.create({
        model: currentModel,
        max_tokens: maxTokens,
        messages,"""

content = content.replace("""      const response = await anthropic.messages.create({
        model: currentModel,
        max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 8192, 8192),
        messages,""", replacement)

with open("src/lib/ai/providers/anthropic.ts", "w") as f:
    f.write(content)

