let activeDeletions = {}; // Maps tabId -> state

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "START_DELETION") {
        const payload = message.payload;
        const isActive = payload.mode === "foreground";
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            const isXTab = currentTab && currentTab.url && (currentTab.url.includes('x.com') || currentTab.url.includes('twitter.com'));

            if (isXTab) {
                // Use active tab
                injectAndExecute(currentTab.id, payload);
                sendResponse({ success: true });
            } else {
                // Open a new tab to X.com
                chrome.tabs.create({ url: "https://x.com/home", active: isActive }, (tab) => {
                    activeDeletions[tab.id] = { ...payload, status: 'started' };
                    sendResponse({ success: true });
                });
            }
        });
        
        return true; // async response
    }

    if (message.action === "STOP_DELETION") {
        if (sender.tab && activeDeletions[sender.tab.id]) {
            delete activeDeletions[sender.tab.id];
        }
    }
});

function injectAndExecute(tabId, payload) {
    activeDeletions[tabId] = { ...payload, status: 'injected' };
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
    }, () => {
        // Wait briefly for content script to mount
        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
                action: "EXECUTE",
                payload: activeDeletions[tabId]
            });
        }, 1000); 
    });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && activeDeletions[tabId]) {
        if (tab.url.includes('x.com') || tab.url.includes('twitter.com')) {
            // Re-inject on reload or first load
            injectAndExecute(tabId, activeDeletions[tabId]);
        }
    }
});
