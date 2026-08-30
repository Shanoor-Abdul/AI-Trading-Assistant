// Background service worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TAKE_SCREENSHOT") {
    // Must return true to indicate we will sendResponse asynchronously
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true; 
  }
});
