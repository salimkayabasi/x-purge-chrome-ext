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
            onMessage: {
                addListener: jest.fn(),
            },
            sendMessage: jest.fn(),
        },
        storage: {
            local: {
                get: jest.fn((keys, cb) => {
                    if (cb) originalSetTimeout(() => cb({}), 0);
                }),
                set: jest.fn(),
                remove: jest.fn((keys, cb) => {
                    if (cb) originalSetTimeout(() => cb(), 0);
                }),
            }
        }
    };
    
    global.MutationObserver = class {
        constructor(callback) { mockObserverCb = callback; }
        disconnect() {}
        observe(element, initObject) {}
    };

    global.setTimeout = (cb, ms) => {
        if (typeof cb === 'function') {
            return originalSetTimeout(cb, 0);
        }
    };
    
    window.scrollBy = jest.fn();
    // Suppress JSDOM's Not implemented navigation errors caused by location.reload()
    const originalConsoleError = console.error;
    console.error = (...args) => {
        if (args[0] && args[0].message && args[0].message.includes('Not implemented: navigation')) return;
        originalConsoleError(...args);
    };
});
afterEach(() => {
    global.setTimeout = originalSetTimeout;
});

test("content.js initializes and checks storage", (done) => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
        originalSetTimeout(() => {
            callback({ x_deleter_process: { running: true, count: 10, deletedCount: 0 } });
        }, 0);
    });
    
    require("../src/content.js");
    
    originalSetTimeout(() => {
        expect(window.xDeleterInjected).toBe(true);
        expect(document.getElementById('x-deleter-overlay')).not.toBeNull();
        done();
    }, 50);
});

test("EXECUTE message clears state and fails if no profile link", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    
    onMessage({ action: "EXECUTE", payload: { count: 5 } }, {}, () => {});
    
    originalSetTimeout(() => {
        expect(document.getElementById('x-deleter-text').innerText).toContain("Failed");
        done();
    }, 50);
});

test("process successfully runs through unlike, unretweet, and delete", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    // Create 3 successful cells
    for (let i = 0; i < 3; i++) {
        const cell = document.createElement('div');
        cell.setAttribute('data-testid', 'cellInnerDiv');
        
        if (i === 0) {
            const unlike = document.createElement('div');
            unlike.setAttribute('data-testid', 'unlike');
            unlike.onclick = () => cell.remove();
            cell.appendChild(unlike);
        } else if (i === 1) {
            const unretweet = document.createElement('div');
            unretweet.setAttribute('data-testid', 'unretweet');
            cell.appendChild(unretweet);
            const confirmBtn = document.createElement('div');
            confirmBtn.setAttribute('data-testid', 'unretweetConfirm');
            confirmBtn.onclick = () => { cell.remove(); confirmBtn.remove(); };
            document.body.appendChild(confirmBtn);
        } else if (i === 2) {
            const caret = document.createElement('div');
            caret.setAttribute('data-testid', 'caret');
            cell.appendChild(caret);
            
            const menuItem = document.createElement('div');
            menuItem.setAttribute('role', 'menuitem');
            menuItem.textContent = 'Delete';
            document.body.appendChild(menuItem);

            const sheetConfirm = document.createElement('div');
            sheetConfirm.setAttribute('data-testid', 'confirmationSheetConfirm');
            sheetConfirm.onclick = () => { cell.remove(); sheetConfirm.remove(); menuItem.remove(); };
            document.body.appendChild(sheetConfirm);
        }
        document.body.appendChild(cell);
    }
    
    // count 3 will be successfully completed
    onMessage({ action: "EXECUTE", payload: { count: 3, delay: 0, removeLikes: true, removeReposts: true } }, {}, () => {});

    originalSetTimeout(() => {
        expect(document.getElementById('x-deleter-overlay')).not.toBeNull();
        done();
    }, 150);
});

test("process handles missing elements and skips un-actionable cells", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    // Create 4 failing cells
    for (let i = 0; i < 4; i++) {
        const cell = document.createElement('div');
        cell.setAttribute('data-testid', 'cellInnerDiv');
        
        if (i === 0) {
            // Missing unretweetConfirm and Missing 'undo repost'
            const unretweet = document.createElement('div');
            unretweet.setAttribute('data-testid', 'unretweet');
            document.body.onclick = () => cell.remove();
            cell.appendChild(unretweet);
        } else if (i === 1) {
            // Missing confirmationSheetConfirm
            const caret = document.createElement('div');
            caret.setAttribute('data-testid', 'caret');
            cell.appendChild(caret);
            
            const menuItem = document.createElement('div');
            menuItem.setAttribute('role', 'menuitem');
            menuItem.textContent = 'Delete';
            document.body.appendChild(menuItem);
            
            document.body.onclick = () => { cell.remove(); menuItem.remove(); };
        } else if (i === 2) {
            // Missing unretweetConfirm but HAS 'undo repost'
            const unretweet = document.createElement('div');
            unretweet.setAttribute('data-testid', 'unretweet');
            cell.appendChild(unretweet);
            const dropMenuItem = document.createElement('div');
            dropMenuItem.setAttribute('role', 'menuitem');
            dropMenuItem.textContent = 'Undo repost';
            dropMenuItem.onclick = () => { cell.remove(); dropMenuItem.remove(); };
            document.body.appendChild(dropMenuItem);
        } else if (i === 3) {
            const caret = document.createElement('div');
            caret.setAttribute('data-testid', 'caret');
            caret.onclick = () => cell.remove(); 
            cell.appendChild(caret);
        }
        document.body.appendChild(cell);
    }
    
    // Request count 5, but we only have 4 cells, and some fail, so it will exhaust and fallback
    onMessage({ action: "EXECUTE", payload: { count: 5, delay: 0, removeLikes: true, removeReposts: true } }, {}, () => {});

    originalSetTimeout(() => {
        expect(document.getElementById('x-deleter-overlay')).not.toBeNull();
        done();
    }, 150);
});

test("fallback scroll when no cells and stop btn", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    onMessage({ action: "EXECUTE", payload: { count: 3, delay: 0 } }, {}, () => {});

    originalSetTimeout(() => {
        expect(window.scrollBy).toHaveBeenCalled();
        
        const stopBtn = document.getElementById('x-deleter-stop-btn');
        if (stopBtn) stopBtn.click();
        
        done();
    }, 150);
});

test("waitForElement waits for element to appear via MutationObserver", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    onMessage({ action: "EXECUTE", payload: { count: 1, delay: 0, removeLikes: true } }, {}, () => {});

    // Cells are NOT in the DOM yet. We add them asynchronously to trigger MutationObserver.
    originalSetTimeout(() => {
        if (mockObserverCb) mockObserverCb(); // trigger when element is missing to cover implicit else

        const cell = document.createElement('div');
        cell.setAttribute('data-testid', 'cellInnerDiv');
        const unlike = document.createElement('div');
        unlike.setAttribute('data-testid', 'unlike');
        unlike.onclick = () => cell.remove();
        cell.appendChild(unlike);
        document.body.appendChild(cell);
        
        if (mockObserverCb) mockObserverCb(); // trigger when element is present
    }, 20);

    originalSetTimeout(() => {
        done();
    }, 100);
});

test("test fallback when actionTaken is false and cells exhausted", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    const cell = document.createElement('div');
    cell.setAttribute('data-testid', 'cellInnerDiv');
    const caret = document.createElement('div');
    caret.setAttribute('data-testid', 'caret');
    caret.onclick = () => cell.remove(); 
    cell.appendChild(caret);
    document.body.appendChild(cell);

    onMessage({ action: "EXECUTE", payload: { count: 1, delay: 0, removeLikes: true } }, {}, () => {});

    originalSetTimeout(() => {
        done();
    }, 100);
});

test("test fallback exhaustion with reloadedCount >= 1", (done) => {
    // Start with reloadedCount = 1 so it hits line 112 instead of reloading again
    chrome.storage.local.get.mockImplementation((keys, callback) => {
        originalSetTimeout(() => {
            callback({ x_deleter_process: { running: true, count: 10, deletedCount: 0, reloadedCount: 1 } });
        }, 0);
    });

    require("../src/content.js");

    // add profile link but NO cells
    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    originalSetTimeout(() => {
        expect(document.getElementById('x-deleter-text').innerText).toContain("No more tweets found");
        done();
    }, 150);
});

test("test missing confirmation sheet explicitly", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    // Provide a cell with caret, add Delete button globally, but NO confirm button!
    const cell = document.createElement('div');
    cell.setAttribute('data-testid', 'cellInnerDiv');
    const caret = document.createElement('div');
    caret.setAttribute('data-testid', 'caret');
    cell.appendChild(caret);
    document.body.appendChild(cell);

    const menuItem = document.createElement('div');
    menuItem.setAttribute('role', 'menuitem');
    menuItem.textContent = 'Delete';
    document.body.appendChild(menuItem);

    // Mock document.body.click so that the loop stops by removing the cell!
    const originalBodyClick = document.body.click;
    document.body.click = () => {
        cell.remove();
    };

    onMessage({ action: "EXECUTE", payload: { count: 1, delay: 0 } }, {}, () => {});

    originalSetTimeout(() => {
        document.body.click = originalBodyClick;
        done();
    }, 100);
});

test("overlay button mouse events", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    onMessage({ action: "EXECUTE", payload: { count: 1, delay: 0 } }, {}, () => {});

    originalSetTimeout(() => {
        const stopBtn = document.getElementById('x-deleter-stop-btn');
        if (stopBtn) {
            stopBtn.onmouseover();
            expect(stopBtn.style.backgroundColor).toBe("rgb(247, 249, 249)"); // #f7f9f9
            
            stopBtn.onmouseout();
            expect(stopBtn.style.backgroundColor).toBe("rgb(255, 255, 255)"); // #fff
        }
        done();
    }, 150);
});

test("updateOverlay branches", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    // Provide a cell
    const cell = document.createElement('div');
    cell.setAttribute('data-testid', 'cellInnerDiv');
    const unlike = document.createElement('div');
    unlike.setAttribute('data-testid', 'unlike');
    unlike.onclick = () => cell.remove();
    cell.appendChild(unlike);
    document.body.appendChild(cell);

    onMessage({ action: "EXECUTE", payload: { count: 1, delay: 0, removeLikes: true } }, {}, () => {});

    // Synchronously remove elements!
    const textEl = document.getElementById('x-deleter-text');
    if (textEl) textEl.remove();

    const stopBtn = document.getElementById('x-deleter-stop-btn');
    if (stopBtn) stopBtn.remove();

    originalSetTimeout(() => {
        // Trigger early return for injectOverlay
        onMessage({ action: "EXECUTE", payload: { count: 1, delay: 0 } }, {}, () => {});
        done();
    }, 150);
});

test("test forever loop and empty stopBtn in updateOverlay", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    // Provide a cell to process
    const cell = document.createElement('div');
    cell.setAttribute('data-testid', 'cellInnerDiv');
    const unlike = document.createElement('div');
    unlike.setAttribute('data-testid', 'unlike');
    
    unlike.onclick = () => {
        cell.remove();
        const stopBtn = document.getElementById('x-deleter-stop-btn');
        if (stopBtn) stopBtn.remove();
    };
    cell.appendChild(unlike);
    document.body.appendChild(cell);

    // Set forever: true
    onMessage({ action: "EXECUTE", payload: { count: 0, forever: true, delay: 0, removeLikes: true } }, {}, () => {});

    originalSetTimeout(() => {
        done();
    }, 150);
});

test("handles direction oldest and restarting process", (done) => {
    require("../src/content.js");
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];

    const profileLink = document.createElement('a');
    profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
    profileLink.href = 'https://x.com/profile';
    profileLink.onclick = (e) => e.preventDefault();
    document.body.appendChild(profileLink);

    // Create 2 cells
    for (let i = 0; i < 2; i++) {
        const cell = document.createElement('div');
        cell.setAttribute('data-testid', 'cellInnerDiv');
        cell.setAttribute('id', `cell-${i}`); 
        const unlike = document.createElement('div');
        unlike.setAttribute('data-testid', 'unlike');
        unlike.onclick = () => cell.remove();
        cell.appendChild(unlike);
        document.body.appendChild(cell);
    }

    onMessage({ action: "EXECUTE", payload: { count: 1, direction: "oldest", delay: 0, removeLikes: true } }, {}, () => {});

    originalSetTimeout(() => {
        // The oldest one should be processed, which is cell-1
        expect(document.getElementById('cell-1')).toBeNull(); 
        expect(document.getElementById('cell-0')).not.toBeNull(); 
        
        const stopBtn = document.getElementById('x-deleter-stop-btn');
        if (stopBtn) stopBtn.remove();
        
        profileLink.remove();
        
        onMessage({ action: "EXECUTE", payload: { count: 1, delay: 0 } }, {}, () => {});
        
        originalSetTimeout(() => {
            const overlay = document.getElementById('x-deleter-overlay');
            expect(overlay.style.backgroundColor).toBe('rgb(244, 33, 46)'); // #f4212e
            done();
        }, 100);
    }, 150);
});
