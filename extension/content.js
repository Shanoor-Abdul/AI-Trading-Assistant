// Store the latest scraped data globally in the content script
let latestMarketData = {
  currentPrice: "Searching...",
  indicators: {}
};
let capturedMacro4H = null;
let capturedMacro1H = null;

// Function to quickly detect the active currency symbol without scanning entire document.body
function getActiveSymbol() {
  const symbolRegex = /([A-Z]{3,5}\s*\/\s*[A-Z]{3,5}(?:\s*\(?OTC\)?)?|EURUSD|GBPUSD|USDJPY|AUDCAD|BTCUSD|Ethereum|Bitcoin|Gold|Silver|Oil)/i;

  // 1. Check document title (instant, 0 CPU)
  let match = document.title.match(symbolRegex);
  if (match) return formatSymbol(match[1]);

  // 2. Check active tabs (aria-selected="true" or active class)
  const activeTabs = document.querySelectorAll('[aria-selected="true"], [class*="active"], [class*="selected"], [class*="current"]');
  for (let tab of activeTabs) {
    let tabMatch = (tab.textContent || "").match(symbolRegex);
    if (tabMatch) return formatSymbol(tabMatch[1]);
  }

  // 3. Check chart asset name/ticker headers
  const headers = document.querySelectorAll('[class*="asset_name"], [class*="ticker"], [class*="asset"], [class*="instrument"], [class*="pair"]');
  for (let header of headers) {
    let headerMatch = (header.textContent || "").match(symbolRegex);
    if (headerMatch) return formatSymbol(headerMatch[1]);
  }

  return null;
}

function formatSymbol(raw) {
  if (!raw) return "";
  return raw.toUpperCase().replace(/\s*\/\s*/, '/').replace(/\(OTC\)/g, "OTC").trim();
}

// Lightweight background ticker update (0% CPU impact, no document.body reflow)
setInterval(() => {
  const detected = getActiveSymbol();
  if (detected) {
    latestMarketData.currentSymbol = detected;
    const root = document.getElementById("ai-trading-root");
    if (root && root.shadowRoot) {
      const symInput = root.shadowRoot.getElementById("symbol");
      if (symInput && document.activeElement !== symInput && symInput.value !== detected) {
        symInput.value = detected;
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
        <option value="Simple MA" selected>Simple MA</option>
      </select>

      <label>Analysis Mode</label>
      <select id="analysisMode">
        <option value="twelvedata" selected>TwelveData (API Math - High Accuracy)</option>
        <option value="vision">Vision (Screenshot - Classic)</option>
      </select>

      <label>AI Model</label>
      <select id="model">
        <optgroup label="Anthropic (Claude Native)">
          <option value="claude-sonnet-5" data-provider="anthropic" selected>Claude 5 Sonnet</option>
          <option value="claude-opus-5" data-provider="anthropic">Claude 5 Opus</option>
          <option value="claude-haiku-4-5-20251001" data-provider="anthropic">Claude 4.5 Haiku</option>
        </optgroup>
        <optgroup label="OpenRouter (100% Free)">
          <option value="openrouter/free" data-provider="openrouter">Auto Free Models Router</option>
          <option value="google/gemini-2.0-flash-lite-preview-02-05:free" data-provider="openrouter">Gemini 2.0 Flash Lite (Free)</option>
          <option value="meta-llama/llama-3-8b-instruct:free" data-provider="openrouter">Llama 3 8B (Free)</option>
          <option value="qwen/qwen-2-7b-instruct:free" data-provider="openrouter">Qwen 2 7B (Free)</option>
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

      <div class="toggle-container" style="margin-top: 8px;">
        <div>
          <p class="toggle-label">🤖 Auto-Pilot Scanner</p>
          <span style="font-size: 10px; color: #10b981;" id="autoPilotStatusText">Auto-scans 15s before candle close</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="autoPilotToggle">
          <span class="slider"></span>
        </label>
      </div>

      <div id="autoPilotTimerBadge" style="display: none; background: #064e3b; color: #6ee7b7; padding: 6px 10px; border-radius: 4px; font-size: 11px; margin-top: 8px; font-weight: 500; text-align: center; border: 1px solid #059669;">
        ⏱️ Auto-Pilot Active: Next scan in <span id="autoPilotCountdown" style="font-weight: bold; color: #ffffff;">--:--</span>
      </div>

      <div style="background: #18181b; padding: 12px; border-radius: 6px; border: 1px solid #3f3f46; margin-top: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #f4f4f5;">Macro Context (Optional)</h3>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <button id="cap4hBtn" style="margin: 0; padding: 6px; width: 45%; font-size: 12px; background: #4f46e5; border: none; color: white; border-radius: 4px; cursor: pointer;">Capture 4H</button>
          <span id="status4h" style="font-size: 11px; color: #a1a1aa; font-weight: bold;">❌ Not Captured</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <button id="cap1hBtn" style="margin: 0; padding: 6px; width: 45%; font-size: 12px; background: #4f46e5; border: none; color: white; border-radius: 4px; cursor: pointer;">Capture 1H</button>
          <span id="status1h" style="font-size: 11px; color: #a1a1aa; font-weight: bold;">❌ Not Captured</span>
        </div>
        <button id="evalMacroBtn" style="margin: 0 0 6px 0; padding: 6px; width: 100%; font-size: 12px; background: #059669; color: white; border: none; cursor: pointer; border-radius: 4px;">Evaluate Macro Market</button>
        <button id="clearMacroBtn" style="margin: 0; padding: 6px; width: 100%; font-size: 12px; background: #ef4444; color: white; border: none; cursor: pointer; border-radius: 4px;">Clear Captured Charts</button>
      </div>

      <button id="analyzeBtn">Analyze Chart</button>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(container);

  bindEvents(shadow, container);
}

// Global click-outside listener
document.addEventListener("mousedown", (e) => {
  const root = document.getElementById("ai-trading-root");
  if (root && root.shadowRoot) {
    const container = root.shadowRoot.getElementById("container");
    if (container && container.classList.contains("open")) {
      // If click target is outside the root div, close the drawer
      if (!root.contains(e.target) && e.target !== root) {
        container.classList.remove("open");
      }
    }
  }
});

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
  const elementsToSave = ["timeframe", "tradeDuration", "model", "autoTradeToggle", "autoPilotToggle", "symbol"];
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
      if (state.autoPilotToggle) {
        startAutoPilot();
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

  // Auto-Pilot Background Loop
  const autoPilotToggle = shadow.getElementById("autoPilotToggle");
  const autoPilotBadge = shadow.getElementById("autoPilotTimerBadge");
  const autoPilotCountdown = shadow.getElementById("autoPilotCountdown");
  const timeframeSelect = shadow.getElementById("timeframe");
  
  let autoPilotInterval = null;
  let isAutoPilotScanning = false;

  function getTimeframeMinutes() {
    const val = timeframeSelect.value;
    if (val === "1m") return 1;
    if (val === "15m") return 15;
    return 5;
  }

  function updateAutoPilotTimer() {
    if (!autoPilotToggle.checked) {
      if (autoPilotBadge) autoPilotBadge.style.display = "none";
      if (autoPilotInterval) {
        clearInterval(autoPilotInterval);
        autoPilotInterval = null;
      }
      return;
    }

    if (autoPilotBadge) autoPilotBadge.style.display = "block";

    const tfMins = getTimeframeMinutes();
    const intervalSecs = tfMins * 60;
    const now = new Date();
    const curSecs = now.getSeconds();
    const curMins = now.getMinutes();

    const elapsedInInterval = (curMins % tfMins) * 60 + curSecs;
    const targetScanSec = intervalSecs - 15; // 15s before candle close

    let remaining = targetScanSec - elapsedInInterval;
    if (remaining <= 0) {
      remaining += intervalSecs;
    }

    const minsDisplay = Math.floor(remaining / 60).toString().padStart(2, '0');
    const secsDisplay = (remaining % 60).toString().padStart(2, '0');
    if (autoPilotCountdown) autoPilotCountdown.innerText = `${minsDisplay}:${secsDisplay}`;

    // When countdown hits 1 second, trigger scan automatically
    if (remaining === 1 && !isAutoPilotScanning && !analyzeBtn.disabled) {
      isAutoPilotScanning = true;
      console.log("[AI Auto-Pilot] Triggering scheduled candle scan 15s before close...");
      analyzeBtn.click();
      setTimeout(() => { isAutoPilotScanning = false; }, 4000);
    }
  }

  function startAutoPilot() {
    updateAutoPilotTimer();
    if (!autoPilotInterval) {
      autoPilotInterval = setInterval(updateAutoPilotTimer, 1000);
    }
  }

  autoPilotToggle.addEventListener("change", () => {
    saveState();
    if (autoPilotToggle.checked) {
      startAutoPilot();
    } else {
      updateAutoPilotTimer();
    }
  });

  // Macro Capture Logic
  const cap4hBtn = shadow.getElementById("cap4hBtn");
  const cap1hBtn = shadow.getElementById("cap1hBtn");
  const clearMacroBtn = shadow.getElementById("clearMacroBtn");
  const status4h = shadow.getElementById("status4h");
  const status1h = shadow.getElementById("status1h");

  async function takeSecretScreenshot() {
    container.style.opacity = "0";
    await new Promise(r => setTimeout(r, 150));
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "TAKE_SCREENSHOT" }, resolve);
    });
    container.style.opacity = "1";
    return response?.dataUrl || null;
  }

  cap4hBtn.addEventListener("click", async () => {
    cap4hBtn.disabled = true;
    const b64 = await takeSecretScreenshot();
    if (b64) {
      capturedMacro4H = b64;
      status4h.innerHTML = `✅ Captured`;
      status4h.style.color = "#22c55e";
    }
    cap4hBtn.disabled = false;
  });

  cap1hBtn.addEventListener("click", async () => {
    cap1hBtn.disabled = true;
    const b64 = await takeSecretScreenshot();
    if (b64) {
      capturedMacro1H = b64;
      status1h.innerHTML = `✅ Captured`;
      status1h.style.color = "#22c55e";
    }
    cap1hBtn.disabled = false;
  });

  clearMacroBtn.addEventListener("click", () => {
    capturedMacro4H = null;
    capturedMacro1H = null;
    status4h.innerHTML = `❌ Not Captured`;
    status4h.style.color = "#a1a1aa";
    status1h.innerHTML = `❌ Not Captured`;
    status1h.style.color = "#a1a1aa";
  });

  const evalMacroBtn = shadow.getElementById("evalMacroBtn");
  evalMacroBtn.addEventListener("click", async () => {
    if (!capturedMacro4H && !capturedMacro1H) {
       shadow.getElementById("reasoningText").innerText = "Please capture 4H or 1H chart first!";
       shadow.getElementById("result").style.display = "block";
       return;
    }
    
    evalMacroBtn.disabled = true;
    evalMacroBtn.innerText = "Evaluating...";
    shadow.getElementById("result").style.display = "none";
    
    const modelEl = shadow.getElementById("model");
    const provider = modelEl.options[modelEl.selectedIndex].getAttribute("data-provider");
    
    const requestBody = {
      macroOnly: true,
      platform: window.location.hostname,
      symbol: shadow.getElementById("symbol").value,
      timeframe: shadow.getElementById("timeframe").value,
      tradeDuration: shadow.getElementById("tradeDuration").value,
      dataSource: shadow.getElementById("analysisMode")?.value || "twelvedata",
      provider: provider,
      model: modelEl.value,
      macroTimeframeImage: capturedMacro4H,
      confirmationTimeframeImage: capturedMacro1H,
      imageBase64: capturedMacro4H || capturedMacro1H // Fallback so API doesn't crash expecting a main image
    };

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: "FETCH_API", 
          payload: requestBody 
        }, resolve);
      });
      
      shadow.getElementById("result").style.display = "block";
      const rsText = shadow.getElementById("reasoningText");
      
      if (response && response.error) {
        rsText.innerText = `API Error: ${response.error}`;
        shadow.getElementById("signalText").innerText = "ERROR";
        shadow.getElementById("signalText").className = "signal";
        shadow.getElementById("levelsDiv").style.display = "none";
        shadow.getElementById("actionText").innerText = "";
      } else if (response && response.data) {
        const data = response.data;
        if (data.error) {
            rsText.innerText = `API Error: ${data.error}`;
            shadow.getElementById("levelsDiv").style.display = "none";
            shadow.getElementById("actionText").innerText = "";
        } else {
            rsText.innerHTML = `<strong>Macro Evaluation:</strong><br/>${data.explanation || "No explanation provided."}`;
            shadow.getElementById("signalText").innerText = data.signal || "UNKNOWN";
            shadow.getElementById("signalText").className = "signal " + (data.signal || "").toLowerCase();
            
            // Explicitly hide the price levels and auto-trade warnings from the previous analysis!
            shadow.getElementById("levelsDiv").style.display = "none";
            shadow.getElementById("actionText").innerText = "";
        }
      } else {
        rsText.innerText = "Error evaluating macro market.";
      }
    } catch (e) {
      console.error(e);
      shadow.getElementById("reasoningText").innerText = "Network Error.";
      shadow.getElementById("result").style.display = "block";
    }
    
    evalMacroBtn.disabled = false;
    evalMacroBtn.innerText = "Evaluate Macro Market";
  });

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
      dataSource: shadow.getElementById("analysisMode")?.value || "twelvedata",
      provider: provider,
      model: modelEl.value,
      imageBase64: base64Image,
      macroTimeframeImage: capturedMacro4H,
      confirmationTimeframeImage: capturedMacro1H,
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
  const isBuy = direction === "BUY" || direction === "STRONG_BUY";
  let targetBtn = null;

  // 1. Try old XPath (Text based: HIGHER, UP, CALL, BUY / LOWER, DOWN, PUT, SELL)
  if (!targetBtn) {
    const xpath = isBuy 
      ? "//button[contains(translate(., 'HIGHER', 'higher'), 'higher') or contains(translate(., 'UP', 'up'), 'up') or contains(translate(., 'CALL', 'call'), 'call') or contains(translate(., 'BUY', 'buy'), 'buy')]"
      : "//button[contains(translate(., 'LOWER', 'lower'), 'lower') or contains(translate(., 'DOWN', 'down'), 'down') or contains(translate(., 'PUT', 'put'), 'put') or contains(translate(., 'SELL', 'sell'), 'sell')]";
    targetBtn = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  // 2. Try generic class names and unicode arrows (For platforms like Binany without text)
  if (!targetBtn) {
    const buttons = Array.from(document.querySelectorAll('button, div[class*="btn"], div[class*="button"], a[class*="btn"]'));
    for (let btn of buttons) {
      const html = btn.innerHTML.toLowerCase();
      const cls = (btn.className || '').toLowerCase();
      
      if (isBuy) {
        if (cls.includes('call') || cls.includes('up') || html.includes('arrow-up') || html.includes('&#8679;') || html.includes('??') || html.includes('??')) {
          targetBtn = btn; break;
        }
      } else {
        if (cls.includes('put') || cls.includes('down') || html.includes('arrow-down') || html.includes('&#8681;') || html.includes('??') || html.includes('??')) {
          targetBtn = btn; break;
        }
      }
    }
  }
  
  // 3. Try to find by distinct button colors (Green = Buy, Red = Sell)
  if (!targetBtn) {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    for (let btn of buttons) {
      const style = window.getComputedStyle(btn);
      const bg = style.backgroundColor;
      if (bg.includes('rgb')) {
        const match = bg.match(/\d+/g);
        if (match && match.length >= 3) {
          const r = parseInt(match[0]), g = parseInt(match[1]), b = parseInt(match[2]);
          if (isBuy && g > r && g > b + 20) { targetBtn = btn; break; }
          if (!isBuy && r > g + 20 && r > b) { targetBtn = btn; break; }
        }
      }
    }
  }

  if (targetBtn) {
    targetBtn.click();
  } else {
    console.error(`AI Auto-Trader: Could not find the ${direction} button!`);
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

