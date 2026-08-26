
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCRAPE_DATA") {
    // Attempt to read indicator text from the DOM.
    // In a production environment, we would target exact classes (e.g. document.querySelector(".rsi-value"))
    // For now, we grab the visible text from the charting area.
    let pageText = document.body.innerText;
    
    // Send the raw text back to the popup
    sendResponse({ data: pageText.substring(0, 5000) }); // Send first 5000 chars to avoid massive payloads
    return true;
  }
  
  if (request.action === "AUTO_TRADE") {
    // Simulating auto-click based on signal
    if (request.signal === "BUY") {
      // Find the green UP/HIGHER button and click it
      const buyBtn = document.evaluate("//button[contains(translate(., \"HIGHER\", \"higher\"), \"higher\") or contains(translate(., \"UP\", \"up\"), \"up\") or contains(translate(., \"CALL\", \"call\"), \"call\")]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (buyBtn) buyBtn.click();
      else alert("Could not find the BUY button on screen!");
    } else if (request.signal === "SELL") {
      // Find the red DOWN/LOWER button and click it
      const sellBtn = document.evaluate("//button[contains(translate(., \"LOWER\", \"lower\"), \"lower\") or contains(translate(., \"DOWN\", \"down\"), \"down\") or contains(translate(., \"PUT\", \"put\"), \"put\")]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (sellBtn) sellBtn.click();
      else alert("Could not find the SELL button on screen!");
    }
  }
});

