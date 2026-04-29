const originalSetTimeout = global.setTimeout;
let mockObserverCb = null;

beforeEach(() => {
    jest.resetModules();
    delete window.xDeleterInjected;
    window.isXDeleterRunning = false;
    mockObserverCb = null;
    document.body.innerHTML = '';

    global.chrome = {
        runtime: {
            onMessage: { addListener: jest.fn() },
            sendMessage: jest.fn((msg, cb) => { if (cb) cb({ tabId: 1 }); }),
        },
        storage: {
            local: {
                get: jest.fn((keys, cb) => { if (cb) cb({}); }),
                set: jest.fn((data, cb) => { if (cb) cb(); if (data.x_deleter_process && global.chrome.storage.onChanged.addListener.mock.calls[0]) { const listener = global.chrome.storage.onChanged.addListener.mock.calls[0][0]; listener({ x_deleter_process: { newValue: data.x_deleter_process } }, 'local'); } }),
                remove: jest.fn((keys, cb) => { if (cb) cb(); }),
            },
            onChanged: { addListener: jest.fn() }
        }
    };
    
    global.MutationObserver = class { constructor(callback) { mockObserverCb = callback; } disconnect() {} observe() {} };
    global.setTimeout = (cb, ms) => { if (typeof cb === 'function') { const delay = (ms === 5000) ? 5000 : 1; return originalSetTimeout(cb, delay); } };
    window.scrollBy = jest.fn();
    const originalConsoleError = console.error;
    console.error = (...args) => { if (args[0] && args[0].message && args[0].message.includes('Not implemented: navigation')) return; originalConsoleError(...args); };
    window.location.reload = jest.fn();
    if (!window.location.split) { window.location.constructor.prototype.split = function(sep) { return this.href.split(sep); }; }
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/user';
    document.body.appendChild(profileLink);
});

afterEach(() => { global.setTimeout = originalSetTimeout; });

test("content.js initializes and checks storage", (done) => {
    chrome.storage.local.get.mockImplementation((keys, callback) => { callback({ x_deleter_process: { running: true, type: "START_PURGE", count: 10, processedCount: 0, masterTabId: 1 } }); });
    require("../src/content.js");
    const check = () => { if (document.getElementById('x-deleter-overlay')) done(); else originalSetTimeout(check, 10); };
    check();
});

test("purge process flow", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const cell = document.createElement('div');
    cell.setAttribute('data-testid', 'cellInnerDiv');
    const caret = document.createElement('div');
    caret.setAttribute('data-testid', 'caret');
    caret.onclick = () => {
        const del = document.createElement('div'); del.setAttribute('role', 'menuitem'); del.innerText = 'Delete';
        del.onclick = () => { const conf = document.createElement('div'); conf.setAttribute('data-testid', 'confirmationSheetConfirm'); conf.onclick = () => cell.remove(); document.body.appendChild(conf); };
        document.body.appendChild(del);
    };
    cell.appendChild(caret);
    document.body.appendChild(cell);
    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, delay: 0 } }, {}, () => {});
    originalSetTimeout(() => { expect(document.getElementById('cellInnerDiv')).toBeNull(); done(); }, 1000);
});

test("unfollow process flow", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    window.history.pushState({}, '', '/user/following');
    const userCell = document.createElement('div'); userCell.setAttribute('data-testid', 'UserCell');
    const caret = document.createElement('div'); caret.setAttribute('data-testid', 'caret');
    caret.onclick = () => {
        const block = document.createElement('div'); block.setAttribute('role', 'menuitem'); block.innerText = 'Block @user';
        block.onclick = () => { const conf = document.createElement('div'); conf.setAttribute('data-testid', 'confirmationSheetConfirm'); conf.onclick = () => userCell.setAttribute('data-x-processed', 'true'); document.body.appendChild(conf); };
        document.body.appendChild(block);
    };
    userCell.appendChild(caret);
    document.body.appendChild(userCell);
    onMessage({ action: "EXECUTE", payload: { type: "START_UNFOLLOW", count: 1, delay: 0, includeBlock: true } }, {}, () => {});
    originalSetTimeout(() => { expect(userCell.hasAttribute('data-x-processed')).toBe(true); done(); }, 1000);
});

test("dislike and unbookmark completion", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    window.history.pushState({}, '', '/user/likes');
    const cell = document.createElement('div'); cell.setAttribute('data-testid', 'cellInnerDiv');
    const unlike = document.createElement('div'); unlike.setAttribute('data-testid', 'unlike'); unlike.onclick = () => cell.remove();
    cell.appendChild(unlike); document.body.appendChild(cell);
    onMessage({ action: "EXECUTE", payload: { type: "START_DISLIKE", count: 1, delay: 0 } }, {}, () => {});
    originalSetTimeout(() => { expect(document.getElementById('x-deleter-text').innerText).toContain("Completed"); done(); }, 1000);
});

test("navigation error states", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    onMessage({ action: "EXECUTE", payload: { type: "START_UNFOLLOW", count: 1, delay: 0 } }, {}, () => {});
    originalSetTimeout(() => { expect(document.getElementById('x-deleter-text')).not.toBeNull(); done(); }, 500);
});

test("overlay stop functionality", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, delay: 0 } }, {}, () => {});
    originalSetTimeout(() => {
        const stopBtn = document.getElementById('x-deleter-stop-btn');
        stopBtn.onmouseover(); stopBtn.onmouseout(); stopBtn.click();
        expect(stopBtn.disabled).toBe(true); done();
    }, 100);
});

test("repost undo branch", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const cell = document.createElement('div'); cell.setAttribute('data-testid', 'cellInnerDiv');
    const unretweet = document.createElement('div'); unretweet.setAttribute('data-testid', 'unretweet');
    unretweet.onclick = () => { const menu = document.createElement('div'); menu.setAttribute('role', 'menuitem'); menu.innerText = 'Undo Repost'; menu.onclick = () => cell.remove(); document.body.appendChild(menu); };
    cell.appendChild(unretweet); document.body.appendChild(cell);
    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, delay: 0, removeReposts: true } }, {}, () => {});
    originalSetTimeout(() => { expect(document.getElementById('cellInnerDiv')).toBeNull(); done(); }, 1000);
});
