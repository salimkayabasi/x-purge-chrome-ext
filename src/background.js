let activeTasks = {}; // Maps tabId -> state

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "START_PURGE" || message.action === "START_UNFOLLOW" || message.action === "START_DISLIKE") {
        const payload = { ...message.payload, type: message.action };
        const isActive = payload.mode === "foreground";
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            const isXTab = currentTab && currentTab.url && (currentTab.url.includes('x.com') || currentTab.url.includes('twitter.com'));

            if (isXTab) {
                injectAndExecute(currentTab.id, payload);
                sendResponse({ success: true });
            } else {
                chrome.tabs.create({ url: "https://x.com/home", active: isActive }, (tab) => {
                    activeTasks[tab.id] = { ...payload, status: 'started' };
                    sendResponse({ success: true });
                });
            }
        });
        
        return true; 
    }

    if (message.action === "STOP_TASK") {
        if (sender.tab && activeTasks[sender.tab.id]) {
            delete activeTasks[sender.tab.id];
        }
    }
});

function injectAndExecute(tabId, payload) {
    activeTasks[tabId] = { ...payload, status: 'injected' };
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
    }, () => {
        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
                action: "EXECUTE",
                payload: activeTasks[tabId]
            });
        }, 1000); 
    });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && activeTasks[tabId]) {
        if (tab.url.includes('x.com') || tab.url.includes('twitter.com')) {
            injectAndExecute(tabId, activeTasks[tabId]);
        }
    }
});

