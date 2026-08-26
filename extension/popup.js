
document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const btn = document.getElementById("analyzeBtn");
  btn.innerText = "Extracting Chart Data...";
  btn.disabled = true;

  // 1. Ask content script to scrape the DOM
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "SCRAPE_DATA" }, async (response) => {
      if (!response || response.error) {
        alert("Failed to read chart data from page.");
        btn.innerText = "Analyze & Auto-Trade";
        btn.disabled = false;
        return;
      }

      btn.innerText = "AI Analyzing (Fast Mode)...";
      
      const symbol = document.getElementById("symbol").value;
      const timeframe = document.getElementById("timeframe").value;
      const model = document.getElementById("model").value;

      try {
        // 2. Send the extracted text data to our local backend
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
            extractedTextData: response.data // Custom field we will add to backend
          })
        });

        const result = await apiRes.json();
        
        // 3. Display result
        const resultDiv = document.getElementById("result");
        const signalText = document.getElementById("signalText");
        const reasoningText = document.getElementById("reasoningText");
        
        resultDiv.style.display = "block";
        signalText.innerText = result.signal + " (Conf: " + result.confidence + "%)";
        signalText.className = "signal " + (result.signal === "BUY" ? "buy" : result.signal === "SELL" ? "sell" : "wait");
        reasoningText.innerText = result.reasoning;

        // 4. Auto-click the button on the broker page if BUY or SELL
        if (result.signal === "BUY" || result.signal === "SELL") {
           chrome.tabs.sendMessage(tabs[0].id, { action: "AUTO_TRADE", signal: result.signal });
        }

      } catch (err) {
        alert("API Error: " + err.message);
      } finally {
        btn.innerText = "Analyze & Auto-Trade";
        btn.disabled = false;
      }
    });
  });
});

