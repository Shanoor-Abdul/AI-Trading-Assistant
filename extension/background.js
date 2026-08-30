// Background service worker

// When the user clicks the extension icon in the toolbar
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_UI" }).catch(() => {
      console.log("Failed to send message to tab. Content script might not be loaded yet.");
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TAKE_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true; 
  }
  
  if (request.action === "FETCH_API") {
    fetch("http://127.0.0.1:3000/api/mobile-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
    .then(res => res.json())
    .then(data => sendResponse({ data: data }))
    .catch(err => sendResponse({ error: err.message }));
    
    return true; // Keep message channel open for async response
  }
});
