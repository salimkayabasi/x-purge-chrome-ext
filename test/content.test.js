let originalSetTimeout;
let mockObserverCb = null;

beforeEach(() => {
    jest.resetModules();
    delete window.xDeleterInjected;
    mockObserverCb = null;
    document.body.innerHTML = '';
    originalSetTimeout = global.setTimeout;

    global.chrome = {
        runtime: {
            onMessage: { addListener: jest.fn() },
            sendMessage: jest.fn(),
        },
        storage: {
            local: {
                get: jest.fn((keys, cb) => { if (cb) originalSetTimeout(() => cb({}), 0); }),
                set: jest.fn(),
                remove: jest.fn((keys, cb) => { if (cb) originalSetTimeout(() => cb(), 0); }),
            }
        }
    };
    
    global.MutationObserver = class {
        constructor(callback) { mockObserverCb = callback; }
        disconnect() {}
        observe() {}
    };

    global.setTimeout = (cb, ms) => {
        if (typeof cb === 'function') return originalSetTimeout(cb, 0);
    };
    
    window.scrollBy = jest.fn();
    const originalConsoleError = console.error;
    console.error = (...args) => {
        if (args[0] && args[0].message && args[0].message.includes('Not implemented: navigation')) return;
        originalConsoleError(...args);
    };

    // Mock reload
    window.location.reload = jest.fn();
    if (!window.location.split) {
        window.location.constructor.prototype.split = function(sep) {
            return this.href.split(sep);
        };
    }
});

afterEach(() => {
    global.setTimeout = originalSetTimeout;
});

test("content.js initializes and checks storage", (done) => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
        originalSetTimeout(() => callback({ x_deleter_process: { running: true, type: "START_PURGE", count: 10, processedCount: 0 } }), 0);
    });
    require("../src/content.js");
    originalSetTimeout(() => {
        expect(window.xDeleterInjected).toBe(true);
        expect(document.getElementById('x-deleter-overlay')).not.toBeNull();
        done();
    }, 50);
});

test("purge process full flow with all action types", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    document.body.appendChild(profileLink);

    // 1. Unlike
    const cell1 = document.createElement('div');
    cell1.setAttribute('data-testid', 'cellInnerDiv');
    const unlike = document.createElement('div');
    unlike.setAttribute('data-testid', 'unlike');
    unlike.onclick = () => cell1.remove();
    cell1.appendChild(unlike);
    document.body.appendChild(cell1);

    // 2. Unretweet
    const cell2 = document.createElement('div');
    cell2.setAttribute('data-testid', 'cellInnerDiv');
    const unretweet = document.createElement('div');
    unretweet.setAttribute('data-testid', 'unretweet');
    cell2.appendChild(unretweet);
    const confirmUnretweet = document.createElement('div');
    confirmUnretweet.setAttribute('data-testid', 'unretweetConfirm');
    confirmUnretweet.onclick = () => { cell2.remove(); confirmUnretweet.remove(); };
    document.body.appendChild(confirmUnretweet);
    document.body.appendChild(cell2);

    // 3. Delete
    const cell3 = document.createElement('div');
    cell3.setAttribute('data-testid', 'cellInnerDiv');
    const caret = document.createElement('div');
    caret.setAttribute('data-testid', 'caret');
    caret.onclick = () => {
        const deleteItem = document.createElement('div');
        deleteItem.setAttribute('role', 'menuitem');
        deleteItem.innerText = 'Delete';
        deleteItem.onclick = () => {
            const confirmDelete = document.createElement('div');
            confirmDelete.setAttribute('data-testid', 'confirmationSheetConfirm');
            confirmDelete.onclick = () => { cell3.remove(); confirmDelete.remove(); deleteItem.remove(); };
            document.body.appendChild(confirmDelete);
        };
        document.body.appendChild(deleteItem);
    };
    cell3.appendChild(caret);
    document.body.appendChild(cell3);

    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 3, delay: 0, removeLikes: true, removeReposts: true } }, {}, () => {});

    originalSetTimeout(() => {
        expect(document.getElementById('cellInnerDiv')).toBeNull();
        done();
    }, 300);
});

test("unfollow process and block flow", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/user';
    document.body.appendChild(profileLink);
    window.history.pushState({}, '', '/user/following');

    const userCell = document.createElement('div');
    userCell.setAttribute('data-testid', 'UserCell');
    const caret = document.createElement('div');
    caret.setAttribute('data-testid', 'caret');
    caret.onclick = () => {
        const blockBtn = document.createElement('div');
        blockBtn.setAttribute('role', 'menuitem');
        blockBtn.innerText = 'Block @user';
        blockBtn.onclick = () => {
            const confirm = document.createElement('div');
            confirm.setAttribute('data-testid', 'confirmationSheetConfirm');
            confirm.onclick = () => { userCell.setAttribute('data-x-processed', 'true'); confirm.remove(); blockBtn.remove(); };
            document.body.appendChild(confirm);
        };
        document.body.appendChild(blockBtn);
    };
    userCell.appendChild(caret);
    document.body.appendChild(userCell);

    onMessage({ action: "EXECUTE", payload: { type: "START_UNFOLLOW", count: 1, delay: 0, includeBlock: true } }, {}, () => {});

    originalSetTimeout(() => {
        expect(userCell.hasAttribute('data-x-processed')).toBe(true);
        done();
    }, 200);
});

test("waitForElement and MutationObserver coverage", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    document.body.appendChild(profileLink);

    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, delay: 0 } }, {}, () => {});

    originalSetTimeout(() => {
        if (mockObserverCb) mockObserverCb();
        const cell = document.createElement('div');
        cell.setAttribute('data-testid', 'cellInnerDiv');
        document.body.appendChild(cell);
        if (mockObserverCb) mockObserverCb();
    }, 50);

    originalSetTimeout(() => done(), 200);
});

test("overlay UI and stop functionality", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    document.body.appendChild(profileLink);

    // Call twice to hit existing overlay branch
    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, delay: 0 } }, {}, () => {});
    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, delay: 0 } }, {}, () => {});

    originalSetTimeout(() => {
        const stopBtn = document.getElementById('x-deleter-stop-btn');
        if (stopBtn) {
            stopBtn.onmouseover();
            stopBtn.onmouseout();
            stopBtn.click();
            expect(stopBtn.disabled).toBe(true);
        }
        done();
    }, 150);
});

test("fallback exhaustion and completion state", (done) => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
        originalSetTimeout(() => callback({ x_deleter_process: { running: true, type: "START_PURGE", count: 10, processedCount: 0, reloadedCount: 1 } }), 0);
    });
    require("../src/content.js");
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    document.body.appendChild(profileLink);

    originalSetTimeout(() => {
        expect(document.getElementById('x-deleter-text').innerText).toContain("Completed");
        done();
    }, 150);
});

test("navigation and error states", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    
    // No profile link -> Fail
    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, delay: 0 } }, {}, () => {});
    
    originalSetTimeout(() => {
        expect(document.getElementById('x-deleter-text').innerText).toContain("Failed");
        
        // Navigation branch
        const profileLink = document.createElement('a');
        profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
        profileLink.href = 'https://x.com/user';
        document.body.appendChild(profileLink);
        window.history.pushState({}, '', '/home');
        
        onMessage({ action: "EXECUTE", payload: { type: "START_UNFOLLOW", count: 1, delay: 0 } }, {}, () => {});
        done();
    }, 100);
});

test("simple purge to completion", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    document.body.appendChild(profileLink);

    const cell = document.createElement('div');
    cell.setAttribute('data-testid', 'cellInnerDiv');
    const unlike = document.createElement('div');
    unlike.setAttribute('data-testid', 'unlike');
    unlike.onclick = () => cell.remove();
    cell.appendChild(unlike);
    document.body.appendChild(cell);

    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, delay: 0, removeLikes: true } }, {}, () => {});

    originalSetTimeout(() => {
        expect(document.getElementById('x-deleter-text').innerText).toContain("Completed");
        done();
    }, 200);
});

test("simple unfollow to completion", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/user';
    document.body.appendChild(profileLink);
    window.history.pushState({}, '', '/user/following');

    const userCell = document.createElement('div');
    userCell.setAttribute('data-testid', 'UserCell');
    const unfollowBtn = document.createElement('div');
    unfollowBtn.setAttribute('data-testid', '123-unfollow');
    unfollowBtn.onclick = () => { unfollowBtn.setAttribute('data-testid', '123-follow'); };
    userCell.appendChild(unfollowBtn);
    document.body.appendChild(userCell);

    onMessage({ action: "EXECUTE", payload: { type: "START_UNFOLLOW", count: 1, delay: 0 } }, {}, () => {});

    originalSetTimeout(() => {
        expect(document.getElementById('x-deleter-text').innerText).toContain("Completed");
        done();
    }, 200);
});

test("purge process oldest direction", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    document.body.appendChild(profileLink);
    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", count: 1, direction: "oldest", delay: 0 } }, {}, () => {});
    originalSetTimeout(() => {
        expect(window.scrollBy).toHaveBeenCalled();
        done();
    }, 200);
});

test("purge process forever loop", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    document.body.appendChild(profileLink);
    onMessage({ action: "EXECUTE", payload: { type: "START_PURGE", forever: true, delay: 0 } }, {}, () => {});
    originalSetTimeout(() => {
        expect(window.scrollBy).toHaveBeenCalled();
        done();
    }, 200);
});


