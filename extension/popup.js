
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



  const isCaptureMode = document.getElementById("captureModeToggle").checked;
  const isAutoTradeOn = document.getElementById("autoTradeToggle").checked;
  const symbol = document.getElementById("symbol").value;
  const timeframe = document.getElementById("timeframe").value;
  const tradeDuration = document.getElementById("tradeDuration").value;
  const indicatorsRaw = document.getElementById("indicators").value;
  const strategiesRaw = document.getElementById("strategies").value;
  const visibleIndicators = indicatorsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const selectedStrategies = strategiesRaw.split(",").map(s => s.trim()).filter(Boolean);
  const model = document.getElementById("model").value;

  btn.innerText = isCaptureMode ? "Capturing Image..." : "Scraping Text...";

  try {
    let payloadBase64 = null;
    let payloadText = null;

    // --- STEP 1: GET THE DATA (IMAGE OR TEXT) ---
    if (isCaptureMode) {
      payloadBase64 = await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) reject(new Error(chrome.runtime.lastError?.message || "Failed to capture image"));
          else { console.log("[AI Trading] Captured Canvas Screenshot! Image size (bytes):", dataUrl.length); resolve(dataUrl); }
        });
      });
    } else {
      payloadText = await new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, { action: "SCRAPE_DATA" }, (response) => {
            if (!response || response.error) reject(new Error("Failed to read HTML text. Did you refresh the page?"));
            else resolve(response.data);
          });
        });
      });
    }

    btn.innerText = "AI Analyzing...";

    // --- STEP 2: SEND TO BACKEND ---
    const apiRes = await fetch("http://localhost:3000/api/mobile-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        timeframe,
        tradeDuration: tradeDuration,
        provider: "openrouter",
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

