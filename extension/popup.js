
document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const btn = document.getElementById("analyzeBtn");
  btn.innerText = "Capturing Chart...";
  btn.disabled = true;

  try {
    // 1. Instantly capture the visible screen (no manual screenshot needed!)
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, async (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        alert("Failed to capture screen: " + (chrome.runtime.lastError?.message || "Unknown error"));
        btn.innerText = "Analyze & Auto-Trade";
        btn.disabled = false;
        return;
      }

      btn.innerText = "AI Analyzing Vision...";
      
      const symbol = document.getElementById("symbol").value;
      const timeframe = document.getElementById("timeframe").value;
      const model = document.getElementById("model").value;

      // 2. Send the automated screenshot to our local backend
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
          imageBase64: dataUrl // Send the captured image automatically!
        })
      });

      const result = await apiRes.json();
      
      const resultDiv = document.getElementById("result");
      const signalText = document.getElementById("signalText");
      const reasoningText = document.getElementById("reasoningText");
      
      resultDiv.style.display = "block";

      if (result.error) {
         signalText.innerText = "API Error";
         signalText.className = "signal sell";
         reasoningText.innerText = result.error + (result.code ? " (" + result.code + ")" : "");
         return;
      }

      signalText.innerText = result.signal + " (Conf: " + result.confidence + "%)";
      signalText.className = "signal " + (result.signal === "BUY" ? "buy" : result.signal === "SELL" ? "sell" : "wait");
      reasoningText.innerText = result.reasoning;

      // 3. Auto-click the button on the broker page
      if (result.signal === "BUY" || result.signal === "SELL") {
         chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "AUTO_TRADE", signal: result.signal });
         });
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
    // Reset button after 3 seconds
    setTimeout(() => {
        btn.innerText = "Analyze & Auto-Trade";
        btn.disabled = false;
    }, 3000);
  }
});

