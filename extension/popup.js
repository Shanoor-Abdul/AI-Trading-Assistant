
document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const btn = document.getElementById("analyzeBtn");
  btn.innerText = "Extracting Chart Data...";
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "SCRAPE_DATA" }, async (response) => {
      if (!response || response.error) {
        alert("Failed to read chart data from page. Did you refresh the broker page?");
        btn.innerText = "Analyze & Auto-Trade";
        btn.disabled = false;
        return;
      }

      btn.innerText = "AI Analyzing (Fast Mode)...";
      
      const symbol = document.getElementById("symbol").value;
      const timeframe = document.getElementById("timeframe").value;
      const model = document.getElementById("model").value;

      try {
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
            extractedTextData: response.data 
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

        if (result.signal === "BUY" || result.signal === "SELL") {
           chrome.tabs.sendMessage(tabs[0].id, { action: "AUTO_TRADE", signal: result.signal });
        }

      } catch (err) {
        const resultDiv = document.getElementById("result");
        const signalText = document.getElementById("signalText");
        const reasoningText = document.getElementById("reasoningText");
        resultDiv.style.display = "block";
        signalText.innerText = "Network Error";
        signalText.className = "signal sell";
        reasoningText.innerText = err.message + " (Is your Next.js local server running on port 3000?)";
      } finally {
        btn.innerText = "Analyze & Auto-Trade";
        btn.disabled = false;
      }
    });
  });
});

