
// Store the latest scraped data globally in the content script
let latestMarketData = {
  currentPrice: "Searching...",
  indicators: {}
};

// --- CONTINUOUS BACKGROUND READING ---
// This runs every 1 second continuously in the background, without the user doing anything
setInterval(() => {
  const pageText = document.body.innerText;
  
  // Here we would ideally use exact HTML class names like:
  // latestMarketData.currentPrice = document.querySelector(".current-price").innerText;
  
  // As a fallback for the demo, we do a smart search of the raw text
  // Looking for common patterns like "RSI1: 57.7778", "UP: 1.16768", etc.
  const rsiMatch = pageText.match(/RSI1?:\s*([0-9.]+)/i);
  const macdMatch = pageText.match(/MACD.*?:\s*([-0-9.]+)/i);
  const bollUpMatch = pageText.match(/UP:\s*([0-9.]+)/i);
  const bollDnMatch = pageText.match(/DN:\s*([0-9.]+)/i);
  
  // Update our live state
  if (rsiMatch) latestMarketData.indicators.RSI = rsiMatch[1];
  if (macdMatch) latestMarketData.indicators.MACD = macdMatch[1];
  if (bollUpMatch) latestMarketData.indicators.BollingerUp = bollUpMatch[1];
  if (bollDnMatch) latestMarketData.indicators.BollingerDown = bollDnMatch[1];
  
  // Find current price (often the largest or specifically highlighted number, assuming regex for asset price format)
  // For now, we will pass the snippet of text, but in prod we target the exact DOM element.
  latestMarketData.rawTextDump = pageText.substring(0, 1000); 

  console.log("[AI Trading] Continuously updated live market data:", latestMarketData);
}, 1000); // 1000 ms = 1 second


// --- LISTENING FOR USER CLICK ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCRAPE_DATA") {
    // When the user clicks "Analyze" in the popup, we IMMEDIATELY return the latest continuously tracked values.
    // Zero delay, zero images.
    const payload = JSON.stringify(latestMarketData, null, 2);
    sendResponse({ data: payload });
    return true;
  }
  
  if (request.action === "AUTO_TRADE") {
    // Simulating auto-click based on signal
    if (request.signal === "BUY") {
      const buyBtn = document.evaluate("//button[contains(translate(., \"HIGHER\", \"higher\"), \"higher\") or contains(translate(., \"UP\", \"up\"), \"up\") or contains(translate(., \"CALL\", \"call\"), \"call\")]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (buyBtn) buyBtn.click();
      else console.warn("Could not find the BUY button on screen!");
    } else if (request.signal === "SELL") {
      const sellBtn = document.evaluate("//button[contains(translate(., \"LOWER\", \"lower\"), \"lower\") or contains(translate(., \"DOWN\", \"down\"), \"down\") or contains(translate(., \"PUT\", \"put\"), \"put\")]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (sellBtn) sellBtn.click();
      else console.warn("Could not find the SELL button on screen!");
    }
  }
});

