import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { messages, imageBase64, provider = "gemini", model } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const base64Data = imageBase64 ? (imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64) : null;

    if (provider === "groq") {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) return NextResponse.json({ error: "Missing GROQ_API_KEY" }, { status: 401 });
      
      // Groq Chat completions API (OpenAI compatible)
      const isVisionModel = (model || "llama-3.2-90b-vision-preview").includes("vision");
      const openAiMessages = messages.map((m: any) => {
        if (m.role === "user" && base64Data && isVisionModel && m === messages[messages.length - 1]) {
          return {
            role: m.role,
            content: [
              { type: "text", text: m.content },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
            ]
          };
        }
        return { role: m.role, content: m.content };
      });

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: model || "llama-3.2-90b-vision-preview",
          messages: openAiMessages
        })
      });
      
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return NextResponse.json({ text: data.choices[0].message.content });
    }
    
    else if (provider === "openai") {
      const openAiKey = process.env.OPENAI_API_KEY;
      if (!openAiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 401 });
      
      const openAiMessages = messages.map((m: any) => {
        if (m.role === "user" && base64Data && m === messages[messages.length - 1]) {
          return {
            role: m.role,
            content: [
              { type: "text", text: m.content },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
            ]
          };
        }
        return { role: m.role, content: m.content };
      });

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages: openAiMessages
        })
      });
      
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return NextResponse.json({ text: data.choices[0].message.content });
    }
    else if (provider === "openrouter") {
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (!openRouterKey) return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 401 });
      
      const openRouterMessages = messages.map((m: any) => {
        if (m.role === "user" && base64Data && m === messages[messages.length - 1]) {
          return {
            role: m.role,
            content: [
              { type: "text", text: m.content },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
            ]
          };
        }
        return { role: m.role, content: m.content };
      });

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openRouterKey}`
        },
        body: JSON.stringify({
          model: model === "nvidia/nemotron-nano-12b-v2-vl" ? "nvidia/nemotron-nano-12b-v2-vl:free" : (model || "nvidia/nemotron-nano-12b-v2-vl:free"),
          messages: openRouterMessages
        })
      });
      
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return NextResponse.json({ text: data.choices[0].message.content });
    }

    else {
      // Default: Gemini
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 401 });
      
      const geminiModel = model || "gemini-2.5-flash";

      const geminiContents = messages.map((m: any) => {
        if (m.role === "user" && base64Data && m === messages[messages.length - 1]) {
          return {
            role: m.role === "assistant" ? "model" : "user",
            parts: [
              { text: m.content },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          };
        }
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        };
      });

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents
        })
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return NextResponse.json({ text: data.candidates[0].content.parts[0].text });
    }

  } catch (error: any) {
    console.error("AI Chat Error:", error.message || error);
    return NextResponse.json({ error: "Failed to generate chat response: " + (error.message || "Unknown error") }, { status: 500 });
  }
}
