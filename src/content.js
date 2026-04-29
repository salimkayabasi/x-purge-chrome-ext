window.isXDeleterRunning = false;
let myTabId = null;
let overlayEl;

function initialize() {
    if (typeof window.xDeleterInjected === 'undefined') {
        window.xDeleterInjected = true;

        // Get Tab ID and then check state
        chrome.runtime.sendMessage({ action: "GET_TAB_ID" }, (response) => {
            myTabId = response?.tabId;
            
            chrome.storage.local.get(['x_deleter_process'], (result) => {
                if (result.x_deleter_process && result.x_deleter_process.running) {
                    syncWithStorage(result.x_deleter_process);
                }
            });
        });

        // Listen for storage changes to keep banner in sync across tabs
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.x_deleter_process) {
                const newState = changes.x_deleter_process.newValue;
                if (newState && newState.running) {
                    syncWithStorage(newState);
                } else {
                    removeOverlay();
                }
            }
        });

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "EXECUTE") {
                const payload = { ...message.payload, masterTabId: myTabId, running: true, processedCount: 0 };
                chrome.storage.local.set({ x_deleter_process: payload }, () => {
                    syncWithStorage(payload);
                });
            }
        });
    }
}

function syncWithStorage(state) {
    const titleMap = {
        "START_PURGE": "Purging Tweets",
        "START_UNFOLLOW": "Unfollowing Accounts",
        "START_DISLIKE": "Removing Likes",
        "START_UNBOOKMARK": "Removing Bookmarks"
    };

    const title = titleMap[state.type] || "Processing";
    const total = state.forever ? "∞" : state.count;
    
    injectOverlay(title, total, state.processedCount);

    // If this tab is the master, and not already running, start/resume it
    if (state.masterTabId === myTabId && !window.isXDeleterRunning) {
        startProcess(state);
    }
}

function startProcess(p) {
    if (p.type === "START_UNFOLLOW") {
        startUnfollowProcess(p.count, p.forever, p.delay, p.includeBlock, p.processedCount, p.reloadedCount || 0);
    } else if (p.type === "START_DISLIKE") {
        startDislikeProcess(p.count, p.forever, p.delay, p.processedCount, p.reloadedCount || 0);
    } else if (p.type === "START_UNBOOKMARK") {
        startUnbookmarkProcess(p.count, p.forever, p.delay, p.processedCount, p.reloadedCount || 0);
    } else {
        startPurgeProcess(
            p.count, p.direction, p.forever, p.delay, p.removeReposts, p.removeLikes,
            p.processedCount, p.reloadedCount || 0
        );
    }
}

function clearState() {
    chrome.storage.local.remove(['x_deleter_process']);
    window.isXDeleterRunning = false;
    chrome.runtime.sendMessage({ action: "STOP_TASK" });
}

async function startPurgeProcess(count, direction, forever, delay, removeReposts, removeLikes, initialProcessedCount, initialReloadedCount) {
    if (window.isXDeleterRunning) return;
    window.isXDeleterRunning = true;
    let processedCount = initialProcessedCount || 0;
    let reloadedCount = initialReloadedCount || 0;
    let fallbackScrolls = 0;
    const displayTotal = forever ? "∞" : count;

    const saveState = () => {
        chrome.storage.local.set({
            x_deleter_process: {
                running: true, type: "START_PURGE", masterTabId: myTabId,
                count, direction, forever, delay, removeReposts, removeLikes,
                processedCount, reloadedCount
            }
        });
    };

    const profileLink = await waitForElement('a[data-testid="AppTabBar_Profile_Link"]', 10000);
    if (!profileLink) {
        updateOverlay("Failed to find Profile Link. Are you logged in?");
        clearState();
        return;
    }

    const profilePath = new URL(profileLink.href).pathname;
    if (window.location.pathname !== profilePath) {
        profileLink.click();
        await waitForElement('[data-testid="cellInnerDiv"]', 10000);
    }

    await new Promise(r => setTimeout(r, 1000));

    while (forever || processedCount < count) {
        if (!window.isXDeleterRunning) break;

        const cells = Array.from(document.querySelectorAll('[data-testid="cellInnerDiv"]')).filter(cell => {
            return cell.querySelector('[data-testid="caret"]') || 
                   cell.querySelector('[data-testid="unretweet"]') ||
                   cell.querySelector('[data-testid="unlike"]');
        });

        if (cells.length === 0) {
            if (fallbackScrolls > 50) {
                if (reloadedCount < 1) {
                    reloadedCount++;
                    saveState();
                    updateOverlay("No tweets found. Reloading...");
                    await new Promise(r => setTimeout(r, 1500));
                    location.reload();
                    return;
                }
                updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
                clearState();
                break;
            }
            window.scrollBy(0, 1000);
            fallbackScrolls++;
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        fallbackScrolls = 0;
        let tweetContainer = direction === "oldest" ? cells[cells.length - 1] : cells[0];
        let actionTaken = false;

        let unlikeBtn = tweetContainer.querySelector('[data-testid="unlike"]');
        if (removeLikes && unlikeBtn) {
            unlikeBtn.click();
            actionTaken = true;
        }

        if (!actionTaken && removeReposts) {
            let unretweetBtn = tweetContainer.querySelector('[data-testid="unretweet"]');
            if (unretweetBtn) {
                unretweetBtn.click();
                let undoBtn = await waitForElement('[data-testid="unretweetConfirm"]', 1500);
                if (!undoBtn) {
                    const dropMenuItems = document.querySelectorAll('[role="menuitem"], [data-testid="Dropdown"]');
                    undoBtn = Array.from(dropMenuItems).find(el => /undo repost|repost'u geri al|geri al/i.test(el.textContent));
                }
                if (undoBtn) {
                    undoBtn.click();
                    actionTaken = true;
                } else {
                    document.body.click();
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }

        if (!actionTaken) {
            let targetCaret = tweetContainer.querySelector('[data-testid="caret"]');
            if (targetCaret) {
                targetCaret.click();
                await new Promise(r => setTimeout(r, 700));
                const menuItems = document.querySelectorAll('[role="menuitem"]');
                let deleteBtn = Array.from(menuItems).find(el => el.textContent.includes('Delete'));
                if (deleteBtn) {
                    deleteBtn.click();
                    await new Promise(r => setTimeout(r, 700));
                    const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                    if (confirmBtn) {
                        confirmBtn.click();
                        actionTaken = true;
                    } else {
                        document.body.click();
                    }
                } else {
                    document.body.click();
                    await new Promise(r => setTimeout(r, 400));
                }
            }
        }

        if (actionTaken) {
            processedCount++;
            saveState();
            // updateOverlayCount(processedCount, displayTotal); // Handled by storage listener
            window.scrollBy(0, 150);
        } else {
            window.scrollBy(0, 400);
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        await new Promise(r => setTimeout(r, delay));
    }

    if (forever || processedCount >= count) {
        updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
        clearState();
    }
}

async function startUnfollowProcess(count, forever, delay, includeBlock, initialProcessedCount, initialReloadedCount) {
    if (window.isXDeleterRunning) return;
    window.isXDeleterRunning = true;
    let processedCount = initialProcessedCount || 0;
    let reloadedCount = initialReloadedCount || 0;
    let fallbackScrolls = 0;
    const displayTotal = forever ? "∞" : count;

    const saveState = () => {
        chrome.storage.local.set({
            x_deleter_process: {
                running: true, type: "START_UNFOLLOW", masterTabId: myTabId,
                count, forever, delay, includeBlock,
                processedCount, reloadedCount
            }
        });
    };

    const profileLink = await waitForElement('a[data-testid="AppTabBar_Profile_Link"]', 10000);
    if (!profileLink) {
        updateOverlay("Failed to find Profile Link.");
        clearState();
        return;
    }

    const username = new URL(profileLink.href).pathname.split('/')[1];
    const followingUrl = `https://x.com/${username}/following`;

    if (window.location.href.split('?')[0] !== followingUrl) {
        window.location.href = followingUrl;
        return; 
    }

    await waitForElement('[data-testid="UserCell"]', 10000);
    await new Promise(r => setTimeout(r, 1000));

    while (forever || processedCount < count) {
        if (!window.isXDeleterRunning) break;

        const users = Array.from(document.querySelectorAll('[data-testid="UserCell"]')).filter(user => {
            return !user.hasAttribute('data-x-processed') && 
                   (user.querySelector('[data-testid$="-unfollow"]') || user.querySelector('[data-testid="caret"]'));
        });

        if (users.length === 0) {
            if (fallbackScrolls > 50) {
                updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
                clearState();
                break;
            }
            window.scrollBy(0, 1000);
            fallbackScrolls++;
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        fallbackScrolls = 0;
        let userContainer = users[0];
        let actionTaken = false;
        userContainer.setAttribute('data-x-processed', 'true');

        const unfollowBtn = userContainer.querySelector('[data-testid$="-unfollow"]');
        if (unfollowBtn) {
            unfollowBtn.click();
            const confirmBtn = await waitForElement('[data-testid="confirmationSheetConfirm"]', 2000);
            if (confirmBtn) {
                confirmBtn.click();
                actionTaken = true;
                await new Promise(r => setTimeout(r, 500));
            } else {
                document.body.click();
            }
        }

        if (includeBlock) {
            const caret = userContainer.querySelector('[data-testid="caret"]');
            if (caret) {
                caret.click();
                await new Promise(r => setTimeout(r, 700));
                const menuItems = document.querySelectorAll('[role="menuitem"]');
                let blockBtn = Array.from(menuItems).find(el => el.textContent.includes('Block'));
                if (blockBtn) {
                    blockBtn.click();
                    await new Promise(r => setTimeout(r, 700));
                    const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                    if (confirmBtn) {
                        confirmBtn.click();
                        actionTaken = true;
                    } else {
                        document.body.click();
                    }
                } else {
                    document.body.click();
                }
            }
        }

        if (actionTaken) {
            processedCount++;
            saveState();
            window.scrollBy(0, 150);
        } else {
            window.scrollBy(0, 300);
            continue;
        }

        await new Promise(r => setTimeout(r, delay));
    }

    if (forever || processedCount >= count) {
        updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
        clearState();
    }
}

async function startDislikeProcess(count, forever, delay, initialProcessedCount, initialReloadedCount) {
    if (window.isXDeleterRunning) return;
    window.isXDeleterRunning = true;
    let processedCount = initialProcessedCount || 0;
    let reloadedCount = initialReloadedCount || 0;
    let fallbackScrolls = 0;
    const displayTotal = forever ? "∞" : count;

    const saveState = () => {
        chrome.storage.local.set({
            x_deleter_process: {
                running: true, type: "START_DISLIKE", masterTabId: myTabId,
                count, forever, delay,
                processedCount, reloadedCount
            }
        });
    };

    const profileLink = await waitForElement('a[data-testid="AppTabBar_Profile_Link"]', 10000);
    if (!profileLink) {
        updateOverlay("Failed to find Profile Link.");
        clearState();
        return;
    }

    const username = new URL(profileLink.href).pathname.split('/')[1];
    const likesUrl = `https://x.com/${username}/likes`;

    if (window.location.href.split('?')[0] !== likesUrl) {
        window.location.href = likesUrl;
        return; 
    }

    await waitForElement('[data-testid="cellInnerDiv"]', 10000);
    await new Promise(r => setTimeout(r, 1000));

    while (forever || processedCount < count) {
        if (!window.isXDeleterRunning) break;

        const cells = Array.from(document.querySelectorAll('[data-testid="cellInnerDiv"]')).filter(cell => {
            return cell.querySelector('[data-testid="unlike"]');
        });

        if (cells.length === 0) {
            if (fallbackScrolls > 50) {
                if (reloadedCount < 1) {
                    reloadedCount++;
                    saveState();
                    updateOverlay("No more likes found. Reloading...");
                    await new Promise(r => setTimeout(r, 1500));
                    location.reload();
                    return;
                }
                updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
                clearState();
                break;
            }
            window.scrollBy(0, 1000);
            fallbackScrolls++;
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        fallbackScrolls = 0;
        let tweetContainer = cells[0];
        let actionTaken = false;

        let unlikeBtn = tweetContainer.querySelector('[data-testid="unlike"]');
        if (unlikeBtn) {
            unlikeBtn.click();
            actionTaken = true;
        }

        if (actionTaken) {
            processedCount++;
            saveState();
            window.scrollBy(0, 150);
        } else {
            window.scrollBy(0, 400);
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        await new Promise(r => setTimeout(r, delay));
    }

    if (forever || processedCount >= count) {
        updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
        clearState();
    }
}

async function startUnbookmarkProcess(count, forever, delay, initialProcessedCount, initialReloadedCount) {
    if (window.isXDeleterRunning) return;
    window.isXDeleterRunning = true;
    let processedCount = initialProcessedCount || 0;
    let reloadedCount = initialReloadedCount || 0;
    let fallbackScrolls = 0;
    const displayTotal = forever ? "∞" : count;

    const saveState = () => {
        chrome.storage.local.set({
            x_deleter_process: {
                running: true, type: "START_UNBOOKMARK", masterTabId: myTabId,
                count, forever, delay,
                processedCount, reloadedCount
            }
        });
    };

    const bookmarksUrl = "https://x.com/i/bookmarks";
    if (window.location.href.split('?')[0] !== bookmarksUrl) {
        window.location.href = bookmarksUrl;
        return; 
    }

    await waitForElement('[data-testid="cellInnerDiv"]', 10000);
    await new Promise(r => setTimeout(r, 1000));

    while (forever || processedCount < count) {
        if (!window.isXDeleterRunning) break;

        const cells = Array.from(document.querySelectorAll('[data-testid="cellInnerDiv"]')).filter(cell => {
            return cell.querySelector('[data-testid="removeBookmark"]') || 
                   cell.querySelector('[data-testid="bookmark"]') ||
                   cell.querySelector('[aria-label*="Remove Tweet from Bookmarks"]');
        });

        if (cells.length === 0) {
            if (fallbackScrolls > 50) {
                if (reloadedCount < 1) {
                    reloadedCount++;
                    saveState();
                    updateOverlay("No more bookmarks found. Reloading...");
                    await new Promise(r => setTimeout(r, 1500));
                    location.reload();
                    return;
                }
                updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
                clearState();
                break;
            }
            window.scrollBy(0, 1000);
            fallbackScrolls++;
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        fallbackScrolls = 0;
        let tweetContainer = cells[0];
        let actionTaken = false;

        let removeBtn = tweetContainer.querySelector('[data-testid="removeBookmark"]') || 
                        tweetContainer.querySelector('[data-testid="bookmark"]') ||
                        tweetContainer.querySelector('[aria-label*="Remove Tweet from Bookmarks"]');

        if (removeBtn) {
            removeBtn.click();
            actionTaken = true;
        }

        if (actionTaken) {
            processedCount++;
            saveState();
            window.scrollBy(0, 150);
        } else {
            window.scrollBy(0, 400);
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        await new Promise(r => setTimeout(r, delay));
    }

    if (forever || processedCount >= count) {
        updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
        clearState();
    }
}

function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) return resolve(document.querySelector(selector));
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

function injectOverlay(title, total, current) {
    current = current || 0;
    if (document.getElementById('x-deleter-overlay')) {
        updateOverlayCount(current, total);
        return;
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'x-deleter-overlay';
    overlayEl.style.cssText = 'position:fixed; top:0; left:0; width:100%; background-color:#1d9bf0; color:#fff; display:flex; justify-content:center; align-items:center; gap:20px; padding:12px 15px; font-size:16px; font-weight:bold; z-index:9999999; box-shadow:0 4px 6px rgba(0,0,0,0.3); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;';

    const textEl = document.createElement('span');
    textEl.id = 'x-deleter-text';
    textEl.innerText = `⚠️ ${title}... Processed: ${current}/${total}`;
    overlayEl.appendChild(textEl);

    const stopBtn = document.createElement('button');
    stopBtn.id = 'x-deleter-stop-btn';
    stopBtn.innerText = "Stop Process";
    stopBtn.style.cssText = "background-color:#fff; color:#f4212e; border:none; padding:6px 16px; border-radius:9999px; cursor:pointer; font-size:14px; font-weight:bold; transition:background-color 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);";
    
    stopBtn.onmouseover = () => stopBtn.style.backgroundColor = "#f7f9f9";
    stopBtn.onmouseout = () => stopBtn.style.backgroundColor = "#fff";
    stopBtn.onclick = () => {
        stopBtn.disabled = true;
        stopBtn.innerText = "Stopping...";
        clearState();
    };
    overlayEl.appendChild(stopBtn);
    if (document.body) {
        document.body.appendChild(overlayEl);
    } else {
        document.documentElement.appendChild(overlayEl);
    }
}

initialize();

function updateOverlayCount(current, total) {
    const textEl = document.getElementById('x-deleter-text');
    if (textEl) {
        const title = textEl.innerText.split('...')[0];
        textEl.innerText = `${title}... Processed: ${current}/${total}`;
    }
}

function updateOverlay(text) {
    const textEl = document.getElementById('x-deleter-text');
    const stopBtn = document.getElementById('x-deleter-stop-btn');
    if (textEl) textEl.innerText = text;
    if (overlayEl) {
        if (text.includes("Completed") || text.includes("No more") || text.includes("Stopped")) {
            overlayEl.style.backgroundColor = '#00ba7c';
            if (stopBtn) stopBtn.remove();
            setTimeout(removeOverlay, 5000);
        } else if (text.includes("Failed")) {
            overlayEl.style.backgroundColor = '#f4212e';
            if (stopBtn) stopBtn.remove();
            setTimeout(removeOverlay, 10000);
        }
    }
}

function removeOverlay() {
    const el = document.getElementById('x-deleter-overlay');
    if (el) el.remove();
    overlayEl = null;
}

