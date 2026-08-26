
with open("src/app/api/mobile-analyze/route.ts", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "const extraction = await callProvider({ ...baseRequest, promptOverride: buildMobileExtractionPrompt(baseRequest), rawOutput: true, isProgressive: false });" in line:
        lines[i] = """      let stage1Model = baseRequest.model;
      if (baseRequest.provider === "anthropic") {
        stage1Model = "claude-haiku-4-5-20251001";
      } else if (baseRequest.provider === "openrouter") {
        stage1Model = "google/gemini-2.5-flash";
      }
      const extraction = await callProvider({ ...baseRequest, model: stage1Model, promptOverride: buildMobileExtractionPrompt(baseRequest), rawOutput: true, isProgressive: false });\n"""
        break

with open("src/app/api/mobile-analyze/route.ts", "w") as f:
    f.writelines(lines)
