// --- SAVE AND LOAD POPUP STATE ---
const elementsToSave = ["timeframe", "tradeDuration", "model", "autoTradeToggle"];

function saveState() {
  const state = {};
  elementsToSave.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === "checkbox") state[id] = el.checked;
      else state[id] = el.value;
    }
  });
  
  // Save multi-select indicators separately
  const indSelect = document.getElementById("indicators");
  if (indSelect) {
    state.indicators = Array.from(indSelect.selectedOptions).map(opt => opt.value);
  }
  
  chrome.storage.local.set({ popupState: state });
}

function loadState() {
  chrome.storage.local.get(["popupState"], (result) => {
    if (result.popupState) {
      const state = result.popupState;
      elementsToSave.forEach(id => {
        const el = document.getElementById(id);
        if (el && state[id] !== undefined) {
          if (el.type === "checkbox") el.checked = state[id];
          else el.value = state[id];
        }
      });
      
      // Load multi-select indicators
      const indSelect = document.getElementById("indicators");
      if (indSelect && state.indicators) {
        Array.from(indSelect.options).forEach(opt => {
          opt.selected = state.indicators.includes(opt.value);
        });
      }
    }
  });
}

// Load state on startup
document.addEventListener("DOMContentLoaded", loadState);

// Listen for changes to save state
elementsToSave.forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", saveState);
});
const indSelect = document.getElementById("indicators");
if (indSelect) indSelect.addEventListener("change", saveState);


// --- CONTINUOUS AUTO-FETCH ASSET SYMBOL ---
setInterval(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: () => {
          const selectors = [
            'span.text-\\[10px\\].font-semibold.truncate.max-w-\\[80px\\]',
            'span.text-\\[10px\\].font-semibold',
            'div.asset-name span'
          ];
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.innerText.trim().length > 1) {
              return el.innerText.trim();
            }
          }
          return null;
        }
      }, (results) => {
        if (results && results[0] && results[0].result) {
          const symbolInput = document.getElementById("symbol");
          if (symbolInput) {
            symbolInput.value = results[0].result;
          }
        }
      });
    }
  });
}, 1000);

document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;

  // Clear previous results immediately

  // Clear previous results immediately
  const resultDiv = document.getElementById("result");
  const signalText = document.getElementById("signalText");
  const reasoningText = document.getElementById("reasoningText");
  const actionText = document.getElementById("actionText");
  const levelsDiv = document.getElementById("levelsDiv");
  const entryVal = document.getElementById("entryVal");
  const targetVal = document.getElementById("targetVal");
  const slVal = document.getElementById("slVal");
  
  resultDiv.style.display = "none";
  levelsDiv.style.display = "none";
  signalText.innerText = "";
  reasoningText.innerText = "";
  actionText.innerText = "";



  const isCaptureMode = true; // Hardcoded to always capture
  const isAutoTradeOn = document.getElementById("autoTradeToggle").checked;
  const symbol = document.getElementById("symbol").value;
  const timeframe = document.getElementById("timeframe").value;
  const tradeDuration = document.getElementById("tradeDuration").value;
  const indSelect = document.getElementById("indicators");
  const visibleIndicators = Array.from(indSelect.selectedOptions).map(opt => opt.value);
  const selectedStrategies = ["Auto-Detect"];
  const modelSelect = document.getElementById("model");
  const model = modelSelect.value;
  const provider = modelSelect.options[modelSelect.selectedIndex].getAttribute("data-provider") || "openrouter";

  btn.innerText = "Capturing Image...";

  try {
    let payloadBase64 = null;
    let payloadText = null;

    // --- STEP 1: GET THE DATA (IMAGE OR TEXT) ---
    payloadBase64 = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) reject(new Error(chrome.runtime.lastError?.message || "Failed to capture image"));
        else { 
          console.log("[AI Trading] Captured Canvas Screenshot! Image size (bytes):", dataUrl.length); 
          const debugImg = document.getElementById("debugImage");
          if (debugImg) {
            debugImg.src = dataUrl;
            debugImg.style.display = "block";
          }
          resolve(dataUrl); 
        }
      });
    });

    btn.innerText = "AI Analyzing...";

    // --- STEP 2: SEND TO BACKEND ---
    const apiRes = await fetch("http://localhost:3000/api/mobile-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        timeframe,
        tradeDuration: tradeDuration,
        provider: provider,
        model: model,
        platform: "Binany",
        selectedStrategies: selectedStrategies.length ? selectedStrategies : ["Auto"],
        visibleIndicators: visibleIndicators,
        imageBase64: payloadBase64,       // Will be null if Text Mode
        extractedTextData: payloadText    // Will be null if Capture Mode
      })
    });

    const result = await apiRes.json();
    
    // --- STEP 3: RENDER RESULT ---
    const resultDiv = document.getElementById("result");
    const signalText = document.getElementById("signalText");
    const reasoningText = document.getElementById("reasoningText");
    const actionText = document.getElementById("actionText");
    
    resultDiv.style.display = "block";
    actionText.innerText = "";

    if (result.error) {
       signalText.innerText = "API Error";
       signalText.className = "signal sell";
       reasoningText.innerText = result.error + (result.code ? " (" + result.code + ")" : "");
       return;
    }


    const conf = result.confidence || 0;
    signalText.innerText = result.signal + " (Conf: " + conf + "%)";
    signalText.className = "signal " + (result.signal === "BUY" ? "buy" : result.signal === "SELL" ? "sell" : "wait");
    reasoningText.innerText = result.reasoning;
    
    if (result.entryPrice || result.takeProfit || result.stopLoss) {
       levelsDiv.style.display = "flex";
       entryVal.innerText = result.entryPrice || "--";
       targetVal.innerText = result.takeProfit || "--";
       slVal.innerText = result.stopLoss || "--";
    }


    // --- STEP 4: AUTO-TRADE VALIDATION ---
    if (result.signal === "BUY" || result.signal === "SELL") {
       if (isAutoTradeOn) {
          if (conf >= 85) {
             actionText.innerText = "? Auto-trade executed! Confidence (" + conf + "%) meets the 85% requirement.";
             actionText.style.color = "#4ade80";
             chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "AUTO_TRADE", signal: result.signal });
             });
          } else {
             actionText.innerText = "? Auto-trade skipped: Confidence (" + conf + "%) is below the 85% minimum threshold.";
             actionText.style.color = "#facc15";
          }
       } else {
          actionText.innerText = "? Auto-Trade is OFF. Manual execution required.";
          actionText.style.color = "#94a3b8";
       }
    }

  } catch (err) {
    const resultDiv = document.getElementById("result");
    const signalText = document.getElementById("signalText");
    const reasoningText = document.getElementById("reasoningText");
    resultDiv.style.display = "block";
    signalText.innerText = "Error";
    signalText.className = "signal sell";
    reasoningText.innerText = err.message;
  } finally {
    setTimeout(() => {
        btn.innerText = "Analyze Chart";
        btn.disabled = false;
    }, 3000);
  }
});

