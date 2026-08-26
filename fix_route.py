import re

with open("src/app/api/mobile-analyze/route.ts", "r") as f:
    content = f.read()

stage1_replacement = """      console.log(`[Mobile API Stage 1] Starting image extraction...`);
      const stage1Start = performance.now();
      
      let stage1Model = baseRequest.model;
      if (baseRequest.provider === "anthropic") {
        stage1Model = "claude-haiku-4-5-20251001";
      } else if (baseRequest.provider === "openrouter") {
        stage1Model = "google/gemini-2.5-flash";
      }
      
      const extraction = await callProvider({ ...baseRequest, model: stage1Model, promptOverride: buildMobileExtractionPrompt(baseRequest), rawOutput: true, isProgressive: false });"""

content = content.replace("      console.log(`[Mobile API Stage 1] Starting image extraction...`);\n      const stage1Start = performance.now();\n      const extraction = await callProvider({ ...baseRequest, promptOverride: buildMobileExtractionPrompt(baseRequest), rawOutput: true, isProgressive: false });", stage1_replacement)

with open("src/app/api/mobile-analyze/route.ts", "w") as f:
    f.write(content)
