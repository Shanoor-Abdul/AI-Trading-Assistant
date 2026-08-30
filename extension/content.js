// Store the latest scraped data globally in the content script
let latestMarketData = {
  currentPrice: "Searching...",
  indicators: {}
};

// --- CONTINUOUS BACKGROUND READING ---
setInterval(() => {
  const pageText = document.body.innerText;
  const rsiMatch = pageText.match(/RSI1?:\s*([0-9.]+)/i);
  const macdMatch = pageText.match(/MACD.*?:\s*([-0-9.]+)/i);
  const bollUpMatch = pageText.match(/UP:\s*([0-9.]+)/i);
  const bollDnMatch = pageText.match(/DN:\s*([0-9.]+)/i);
  
  if (rsiMatch) latestMarketData.indicators.RSI = rsiMatch[1];
  if (macdMatch) latestMarketData.indicators.MACD = macdMatch[1];
  if (bollUpMatch) latestMarketData.indicators.BollingerUp = bollUpMatch[1];
  if (bollDnMatch) latestMarketData.indicators.BollingerDown = bollDnMatch[1];
  
  // 1. First, try to find the active currency by looking for a symbol right above the "Investments" panel
  // This is highly reliable for Pocket Option because the right-hand trading panel always shows the active asset.
  let symbolMatch = pageText.match(/([A-Z0-9]{3,5}\/[A-Z0-9]{3,5}(?:\s*\(?OTC\)?)?|[A-Z][a-z]+coin|Ethereum|Gold|Silver|Oil)[\s\S]{0,100}Investments/i);
  
  // 2. Fallback to document title
  if (!symbolMatch) {
    symbolMatch = document.title.match(/([A-Z0-9]{3,5}\/[A-Z0-9]{3,5}(?:\s*\(?OTC\)?)?|[A-Z][a-z]+coin|Ethereum|Gold|Silver|Oil)/i);
  }
  
  // 3. Absolute fallback to any symbol in the page text
  if (!symbolMatch) {
    symbolMatch = pageText.match(/([A-Z0-9]{3,5}\/[A-Z0-9]{3,5}(?:\s*\(?OTC\)?)?|[A-Z][a-z]+coin)/i);
  }

  if (symbolMatch) {
    // Clean up the symbol (e.g. remove parentheses around OTC)
    let cleanSymbol = symbolMatch[1].toUpperCase().replace(/\(OTC\)/g, "OTC").trim();
    latestMarketData.currentSymbol = cleanSymbol;
    
    // Auto-update the UI input if it exists
    const root = document.getElementById("ai-trading-root");
    if (root && root.shadowRoot) {
      const symInput = root.shadowRoot.getElementById("symbol");
      // Only overwrite if the user isn't currently typing in the box, and if the value is actually different
      if (symInput && document.activeElement !== symInput && symInput.value !== latestMarketData.currentSymbol) { 
         symInput.value = latestMarketData.currentSymbol;
      }
    }
  }
}, 1000);


// --- SHADOW DOM UI INJECTION ---
function injectUI() {
  if (document.getElementById("ai-trading-root")) return;

  const rootDiv = document.createElement("div");
  rootDiv.id = "ai-trading-root";
  // Position it fixed to top right so the drawer can slide out
  rootDiv.style.position = "fixed";
  rootDiv.style.top = "0";
  rootDiv.style.right = "0";
  rootDiv.style.height = "100vh";
  rootDiv.style.zIndex = "2147483647"; // Max z-index
  rootDiv.style.pointerEvents = "none"; // Let clicks pass through empty areas
  document.body.appendChild(rootDiv);

  const shadow = rootDiv.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    
    #container {
      position: absolute;
      top: 0;
      right: -380px;
      height: 100vh;
      display: flex;
      align-items: center;
      pointer-events: none;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease;
    }

    #container.open {
      transform: translateX(-380px);
    }

    #toggle-tab {
      width: 40px;
      height: 60px;
      background: #06b6d4;
      border-radius: 8px 0 0 8px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      pointer-events: auto;
      box-shadow: -2px 0 10px rgba(0,0,0,0.5);
      z-index: 10;
      color: white;
      font-weight: bold;
      font-size: 20px;
      font-family: sans-serif;
    }

    #drawer {
      width: 380px;
      height: 100vh;
      background: #09090b;
      color: #fff;
      font-family: system-ui, sans-serif;
      padding: 20px;
      overflow-y: auto;
      pointer-events: auto;
      border-left: 1px solid #27272a;
      box-shadow: -5px 0 25px rgba(0,0,0,0.8);
    }
    
    /* UI CSS FROM OLD POPUP */
    h2 { margin-top: 0; font-size: 18px; border-bottom: 1px solid #3f3f46; padding-bottom: 12px; color: #f4f4f5; margin-bottom: 4px; }
    label { display: block; margin-top: 12px; font-size: 13px; color: #a1a1aa; font-weight: 500; }
    select, input, button { width: 100%; padding: 10px; margin-top: 6px; background: #18181b; border: 1px solid #3f3f46; color: white; border-radius: 6px; box-sizing: border-box; font-size: 13px;}
    select:focus, input:focus { outline: none; border-color: #3b82f6; }
    button { background: #3b82f6; cursor: pointer; font-weight: bold; margin-top: 20px; border: none; padding: 12px; font-size: 14px; transition: background 0.2s; }
    button:hover { background: #2563eb; }
    button:disabled { background: #3f3f46; cursor: not-allowed; }
    #result { margin-top: 16px; padding: 12px; background: #18181b; border-radius: 6px; display: none; font-size: 13px; border: 1px solid #3f3f46; }
    .signal { font-size: 18px; font-weight: bold; margin-bottom: 8px; text-align: center; }
    .buy { color: #22c55e; }
    .sell { color: #ef4444; }
    .wait { color: #eab308; }
    optgroup { font-weight: bold; color: #93c5fd; background: #09090b; }
    option { color: #fff; padding: 4px; }
    
    .levels { margin-bottom: 12px; background: #27272a; padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; display: none; }
    .level-item { display: flex; flex-direction: column; }
    .level-label { font-size: 11px; color: #a1a1aa; font-weight: normal; margin-bottom: 2px; }

    .toggle-container { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; background: #18181b; padding: 12px; border-radius: 6px; border: 1px solid #3f3f46; }
    .toggle-label { font-size: 14px; font-weight: bold; color: #fff; margin: 0;}
    .switch { position: relative; display: inline-block; width: 36px; height: 20px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #3f3f46; transition: .4s; border-radius: 34px; }
    .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
    input:checked + .slider { background-color: #22c55e; }
    input:checked + .slider:before { transform: translateX(16px); }
  `;

  const container = document.createElement("div");
  container.id = "container";
  container.innerHTML = `
    <div id="toggle-tab">S</div>
    <div id="drawer">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #3f3f46; padding-bottom: 12px; margin-bottom: 4px;">
        <h2 style="margin: 0; border: none; padding: 0;">AI Trading Assistant</h2>
        <button id="closeBtn" style="background: transparent; border: none; color: #a1a1aa; font-size: 20px; cursor: pointer; padding: 0; margin: 0; width: auto;">&times;</button>
      </div>
      
      <label>Asset Symbol</label>
      <input type="text" id="symbol" value="AUD/CAD OTC" />

      <label>Candle Timeframe</label>
      <select id="timeframe">
        <option value="1m">1 Minute</option>
        <option value="5m" selected>5 Minutes</option>
        <option value="15m">15 Minutes</option>
      </select>

      <label>Trade Duration</label>
      <select id="tradeDuration">
        <option value="1m">1 Minute</option>
        <option value="5m" selected>5 Minutes</option>
        <option value="15m">15 Minutes</option>
      </select>

      <label>Visible Indicators (Ctrl+Click to multi-select)</label>
      <select id="indicators" multiple size="4">
        <option value="RSI" selected>RSI</option>
        <option value="MACD" selected>MACD</option>
        <option value="Bollinger Bands" selected>Bollinger Bands</option>
        <option value="Moving Averages" selected>Moving Averages</option>
        <option value="Stochastic">Stochastic</option>
        <option value="Parabolic SAR">Parabolic SAR</option>
      </select>

      <label>AI Model</label>
      <select id="model">
        <optgroup label="Anthropic (Native API)">
          <option value="claude-3-5-sonnet-20241022" data-provider="anthropic" selected>Claude 3.5 Sonnet</option>
          <option value="claude-3-5-haiku-20241022" data-provider="anthropic">Claude 3.5 Haiku</option>
        </optgroup>
        <optgroup label="OpenAI (Native API)">
          <option value="gpt-4o" data-provider="openai">GPT-4o (Vision)</option>
          <option value="gpt-4o-mini" data-provider="openai">GPT-4o Mini (Vision)</option>
        </optgroup>
        <optgroup label="Google Gemini (Native API)">
          <option value="gemini-1.5-pro" data-provider="gemini">Gemini 1.5 Pro</option>
          <option value="gemini-1.5-flash" data-provider="gemini">Gemini 1.5 Flash</option>
        </optgroup>
        <optgroup label="Groq (Fast API)">
          <option value="llama-3.2-90b-vision-preview" data-provider="groq">Llama 3.2 90B Vision</option>
          <option value="llama-3.2-11b-vision-preview" data-provider="groq">Llama 3.2 11B Vision</option>
        </optgroup>
        <optgroup label="OpenRouter (Free)">
          <option value="openrouter/free" data-provider="openrouter">OpenRouter Free Models</option>
        </optgroup>
      </select>

      <div class="toggle-container">
        <div>
          <p class="toggle-label">Auto-Execute Trade</p>
          <span style="font-size: 10px; color: #a1a1aa;">Requires >85% Confidence</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="autoTradeToggle">
          <span class="slider"></span>
        </label>
      </div>

      <button id="analyzeBtn">Analyze Chart</button>

      <div id="result">
        <div id="signalText" class="signal"></div>
        <div id="levelsDiv" class="levels">
          <div class="level-item"><span class="level-label">ENTRY</span><span id="entryVal">--</span></div>
          <div class="level-item"><span class="level-label">TARGET</span><span id="targetVal">--</span></div>
          <div class="level-item"><span class="level-label">STOP LOSS</span><span id="slVal">--</span></div>
        </div>
        <div id="reasoningText"></div>
        <div id="actionText" style="margin-top: 10px; font-size: 11px; color: #93c5fd; font-style: italic;"></div>
      </div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(container);

  bindEvents(shadow, container);
}

function bindEvents(shadow, container) {
  const toggleBtn = shadow.getElementById("toggle-tab");
  const drawer = shadow.getElementById("drawer");
  const analyzeBtn = shadow.getElementById("analyzeBtn");

  toggleBtn.addEventListener("click", () => {
    container.classList.toggle("open");
  });
  
  const closeBtn = shadow.getElementById("closeBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      container.classList.remove("open");
    });
  }

  // Load State
  const elementsToSave = ["timeframe", "tradeDuration", "model", "autoTradeToggle", "symbol"];
  chrome.storage.local.get(["popupState"], (result) => {
    if (result.popupState) {
      const state = result.popupState;
      elementsToSave.forEach(id => {
        const el = shadow.getElementById(id);
        if (el && state[id] !== undefined) {
          if (el.type === "checkbox") el.checked = state[id];
          else el.value = state[id];
        }
      });
      const indSelect = shadow.getElementById("indicators");
      if (indSelect && state.indicators) {
        Array.from(indSelect.options).forEach(opt => {
          opt.selected = state.indicators.includes(opt.value);
        });
      }
    }
  });

  function saveState() {
    const state = {};
    elementsToSave.forEach(id => {
      const el = shadow.getElementById(id);
      if (el) state[id] = el.type === "checkbox" ? el.checked : el.value;
    });
    const indSelect = shadow.getElementById("indicators");
    if (indSelect) state.indicators = Array.from(indSelect.selectedOptions).map(opt => opt.value);
    chrome.storage.local.set({ popupState: state });
  }

  elementsToSave.forEach(id => {
    shadow.getElementById(id).addEventListener("change", saveState);
  });
  shadow.getElementById("indicators").addEventListener("change", saveState);

  // Analyze Button Logic
  analyzeBtn.addEventListener("click", async () => {
    const btnText = analyzeBtn.innerText;
    
    // EVASION PROTOCOL: Hide the UI
    container.style.opacity = "0";
    
    // Wait 150ms for the browser to repaint the screen so the UI is truly gone
    await new Promise(r => setTimeout(r, 150));
    
    let base64Image = null;
    try {
      // Ask background script to take the screenshot
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "TAKE_SCREENSHOT" }, resolve);
      });
      if (response && response.dataUrl) {
        base64Image = response.dataUrl;
        console.log("[AI Trading] Evasion Protocol: Screenshot captured cleanly.");
      } else {
        console.error("Screenshot failed:", response?.error);
      }
    } catch (e) {
      console.error("Screenshot error:", e);
    }
    
    // EVASION PROTOCOL OVER: Show the UI again
    container.style.opacity = "1";
    
    analyzeBtn.disabled = true;
    analyzeBtn.innerText = "Analyzing...";
    shadow.getElementById("result").style.display = "none";
    
    // Now prepare API request
    const modelEl = shadow.getElementById("model");
    const provider = modelEl.options[modelEl.selectedIndex].getAttribute("data-provider");
    const indSelect = shadow.getElementById("indicators");
    const visibleIndicators = Array.from(indSelect.selectedOptions).map(o => o.value);
    
    const requestBody = {
      platform: window.location.hostname,
      symbol: shadow.getElementById("symbol").value,
      timeframe: shadow.getElementById("timeframe").value,
      tradeDuration: shadow.getElementById("tradeDuration").value,
      provider: provider,
      model: modelEl.value,
      imageBase64: base64Image,
      extractedTextData: JSON.stringify(latestMarketData, null, 2),
      visibleIndicators: visibleIndicators,
      selectedStrategies: ["Auto (AI Selection)"]
    };

    try {
      // PROXY VIA BACKGROUND.JS TO BYPASS CORS RESTRICTIONS
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: "FETCH_API", 
          payload: requestBody 
        }, resolve);
      });
      
      if (response && response.error) throw new Error(response.error);
      const data = response.data;
      
      const resDiv = shadow.getElementById("result");
      const sigText = shadow.getElementById("signalText");
      const rText = shadow.getElementById("reasoningText");
      const actText = shadow.getElementById("actionText");
      const levDiv = shadow.getElementById("levelsDiv");
      
      resDiv.style.display = "block";
      
      if (data.error) {
        sigText.innerHTML = `<span style="color: #ef4444;">API Error</span>`;
        sigText.className = "signal";
        rText.innerText = data.error;
        actText.innerText = "";
        levDiv.style.display = "none";
        return;
      }
      
      const sig = data.signal || "WAIT";
      let cssClass = "wait";
      if (sig === "BUY" || sig === "STRONG_BUY") cssClass = "buy";
      if (sig === "SELL" || sig === "STRONG_SELL") cssClass = "sell";
      
      sigText.className = `signal ${cssClass}`;
      sigText.innerText = `${sig} (Conf: ${data.confidence}%)`;
      
      rText.innerText = data.reasoning || data.explanation || "";
      
      if (data.entryPrice) {
        levDiv.style.display = "flex";
        shadow.getElementById("entryVal").innerText = data.entryPrice;
        shadow.getElementById("targetVal").innerText = data.takeProfit || "--";
        shadow.getElementById("slVal").innerText = data.stopLoss || "--";
      } else {
        levDiv.style.display = "none";
      }
      
      const autoTrade = shadow.getElementById("autoTradeToggle").checked;
      actText.innerText = "";
      
      if (autoTrade && data.confidence >= 85) {
        if (sig === "STRONG_BUY" || sig === "BUY") {
          actText.innerText = `🤖 Auto-Trade Executed: CLICKED "HIGHER"`;
          clickTradeButton("BUY");
        } else if (sig === "STRONG_SELL" || sig === "SELL") {
          actText.innerText = `🤖 Auto-Trade Executed: CLICKED "LOWER"`;
          clickTradeButton("SELL");
        }
      } else if (autoTrade && data.confidence < 85) {
         actText.innerText = `⚠️ Auto-trade skipped: Confidence ${data.confidence}% < 85%`;
      }
      
    } catch (err) {
      console.error(err);
      shadow.getElementById("result").style.display = "block";
      shadow.getElementById("signalText").innerHTML = `<span style="color: #ef4444;">Network Error</span>`;
      shadow.getElementById("reasoningText").innerText = err.message;
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.innerText = btnText;
    }
  });
}

function clickTradeButton(direction) {
  if (direction === "BUY") {
    const buyBtn = document.evaluate("//button[contains(translate(., 'HIGHER', 'higher'), 'higher') or contains(translate(., 'UP', 'up'), 'up') or contains(translate(., 'CALL', 'call'), 'call')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (buyBtn) buyBtn.click();
  } else if (direction === "SELL") {
    const sellBtn = document.evaluate("//button[contains(translate(., 'LOWER', 'lower'), 'lower') or contains(translate(., 'DOWN', 'down'), 'down') or contains(translate(., 'PUT', 'put'), 'put')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (sellBtn) sellBtn.click();
  }
}

// Do NOT inject by default. Only inject and toggle when background script sends message (user clicked extension icon)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_UI") {
    injectUI(); // Ensure it exists
    const root = document.getElementById("ai-trading-root");
    if (root && root.shadowRoot) {
      const container = root.shadowRoot.getElementById("container");
      if (container) container.classList.toggle("open");
    }
    sendResponse({ status: "ok" });
  }
});

