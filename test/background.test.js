beforeEach(() => {
    // Reset modules to avoid state leaking
    jest.resetModules();
    
    // Mock chrome API
    global.chrome = {
        runtime: {
            onMessage: {
                addListener: jest.fn(),
            }
        },
        tabs: {
            onUpdated: {
                addListener: jest.fn(),
            },
            query: jest.fn(),
            create: jest.fn(),
            sendMessage: jest.fn(),
        },
        scripting: {
            executeScript: jest.fn(),
        }
    };
});

test("background.js registers listeners", () => {
    require("../src/background.js");
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
});

test("handles START_PURGE on an X.com tab", () => {
    require("../src/background.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    
    // Mock tabs.query to return an X tab
    chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        callback([{ id: 101, url: "https://x.com/home" }]);
    });
    
    const sendResponse = jest.fn();
    const result = onMessage({ action: "START_PURGE", payload: { mode: "foreground" } }, {}, sendResponse);
    
    expect(result).toBe(true); // Returns true for async response
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({ target: { tabId: 101 } }),
        expect.any(Function)
    );
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    
    // Simulate content script injected callback
    const executeScriptCallback = chrome.scripting.executeScript.mock.calls[0][1];
    jest.useFakeTimers();
    executeScriptCallback();
    jest.advanceTimersByTime(1000);
    
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(101, {
        action: "EXECUTE",
        payload: expect.objectContaining({ mode: "foreground", status: "injected", type: "START_PURGE" })
    });
    jest.useRealTimers();
});

test("handles START_PURGE on a non-X.com tab", () => {
    require("../src/background.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    
    // Mock tabs.query to return a non-X tab
    chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        callback([{ id: 101, url: "https://google.com" }]);
    });
    
    // Mock tabs.create
    chrome.tabs.create.mockImplementation((options, callback) => {
        callback({ id: 102 });
    });
    
    const sendResponse = jest.fn();
    onMessage({ action: "START_PURGE", payload: { mode: "background" } }, {}, sendResponse);
    
    expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://x.com/home", active: false }),
        expect.any(Function)
    );
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
});

test("handles STOP_TASK", () => {
    require("../src/background.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    
    // First setup an active task
    chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        callback([{ id: 101, url: "https://x.com/home" }]);
    });
    onMessage({ action: "START_PURGE", payload: { mode: "foreground" } }, {}, jest.fn());
    
    onMessage({ action: "STOP_TASK" }, { tab: { id: 101 } }, jest.fn());
});

test("handles tabs.onUpdated for X.com tab", () => {
    require("../src/background.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const onUpdated = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
    
    // Set up active task first
    chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        callback([{ id: 101, url: "https://x.com/home" }]);
    });
    onMessage({ action: "START_PURGE", payload: { mode: "foreground" } }, {}, jest.fn());
    
    // Now trigger onUpdated with different conditions to cover branches
    onUpdated(101, { status: 'loading' }, { url: "https://x.com/somepage" }); // changeInfo.status !== 'complete'
    onUpdated(102, { status: 'complete' }, { url: "https://x.com/somepage" }); // !activeTasks[tabId]
    onUpdated(101, { status: 'complete' }, { url: "https://google.com" }); // url doesn't match
    
    // This one should trigger reinject
    onUpdated(101, { status: 'complete' }, { url: "https://twitter.com/somepage" });
    
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2); // once from START, once from UPDATE
});

test("handles STOP_TASK without sender tab", () => {
    require("../src/background.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    onMessage({ action: "STOP_TASK" }, {}, jest.fn());
});

test("handles START_UNBOOKMARK", () => {
    require("../src/background.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        callback([{ id: 101, url: "https://x.com/home" }]);
    });
    const sendResponse = jest.fn();
    onMessage({ action: "START_UNBOOKMARK", payload: { mode: "foreground" } }, {}, sendResponse);
    expect(chrome.scripting.executeScript).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
});
