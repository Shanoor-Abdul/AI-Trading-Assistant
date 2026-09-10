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
    .then(async (res) => {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        sendResponse({ data: data });
      } catch (parseErr) {
        if (!res.ok) {
          sendResponse({ error: `Server error (${res.status}): Please make sure 'npm run start' or 'npm run dev' is running on port 3000.` });
        } else {
          sendResponse({ error: `Invalid response format from server: ${text.slice(0, 100)}` });
        }
      }
    })
    .catch(err => {
      sendResponse({ error: `Connection failed: ${err.message}. Ensure the Next.js server is running at http://127.0.0.1:3000` });
    });
    
    return true; // Keep message channel open for async response
  }
});
