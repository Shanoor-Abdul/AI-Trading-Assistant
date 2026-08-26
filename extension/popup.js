
document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const btn = document.getElementById("analyzeBtn");
  btn.innerText = "Capturing Chart...";
  btn.disabled = true;

  try {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, async (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        alert("Failed to capture screen: " + (chrome.runtime.lastError?.message || "Unknown error"));
        btn.innerText = "Analyze Chart";
        btn.disabled = false;
        return;
      }

      btn.innerText = "AI Analyzing Vision...";
      
      const symbol = document.getElementById("symbol").value;
      const timeframe = document.getElementById("timeframe").value;
      const model = document.getElementById("model").value;
      const isAutoTradeOn = document.getElementById("autoTradeToggle").checked;

      const apiRes = await fetch("http://localhost:3000/api/mobile-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe,
          tradeDuration: timeframe,
          provider: "openrouter",
          model: model,
          platform: "Binany",
          selectedStrategies: ["Mean Reversion", "Trend Following"],
          visibleIndicators: ["MACD", "RSI", "Bollinger Bands"],
          imageBase64: dataUrl 
        })
      });

      const result = await apiRes.json();
      
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

      // Auto-Trade Validation Logic
      if (result.signal === "BUY" || result.signal === "SELL") {
         if (isAutoTradeOn) {
            if (conf >= 85) {
               actionText.innerText = "? Auto-trade executed! Confidence (" + conf + "%) meets the 85% requirement.";
               actionText.style.color = "#4ade80"; // green
               chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  chrome.tabs.sendMessage(tabs[0].id, { action: "AUTO_TRADE", signal: result.signal });
               });
            } else {
               actionText.innerText = "? Auto-trade skipped: Confidence (" + conf + "%) is below the 85% minimum threshold.";
               actionText.style.color = "#facc15"; // yellow
            }
         } else {
            actionText.innerText = "? Auto-Trade is OFF. Manual execution required.";
            actionText.style.color = "#94a3b8"; // gray
         }
      }

    });

  } catch (err) {
    const resultDiv = document.getElementById("result");
    const signalText = document.getElementById("signalText");
    const reasoningText = document.getElementById("reasoningText");
    resultDiv.style.display = "block";
    signalText.innerText = "Network Error";
    signalText.className = "signal sell";
    reasoningText.innerText = err.message;
  } finally {
    setTimeout(() => {
        btn.innerText = "Analyze Chart";
        btn.disabled = false;
    }, 3000);
  }
});

