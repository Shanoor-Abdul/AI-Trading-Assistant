
with open("src/app/api/mobile-analyze/route.ts", "r") as f:
    content = f.read()

content = content.replace("stage1Model = \"google/gemini-2.5-flash\";", "stage1Model = \"anthropic/claude-3.5-haiku\";")

with open("src/app/api/mobile-analyze/route.ts", "w") as f:
    f.write(content)

