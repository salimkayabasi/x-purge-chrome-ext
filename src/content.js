if (typeof window.xDeleterInjected === 'undefined') {
    window.xDeleterInjected = true;

    // Check for resumed process on load
    chrome.storage.local.get(['x_deleter_process'], (result) => {
        if (result.x_deleter_process && result.x_deleter_process.running) {
            const p = result.x_deleter_process;
            if (p.type === "START_UNFOLLOW") {
                startUnfollowProcess(p.count, p.forever, p.delay, p.includeBlock, p.processedCount, p.reloadedCount || 0);
            } else {
                startPurgeProcess(
                    p.count, p.direction, p.forever, p.delay, p.removeReposts, p.removeLikes,
                    p.processedCount, p.reloadedCount || 0
                );
            }
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "EXECUTE") {
            chrome.storage.local.remove(['x_deleter_process'], () => {
                if (message.payload.type === "START_UNFOLLOW") {
                    startUnfollowProcess(
                        message.payload.count,
                        message.payload.forever,
                        message.payload.delay,
                        message.payload.includeBlock
                    );
                } else {
                    startPurgeProcess(
                        message.payload.count,
                        message.payload.direction,
                        message.payload.forever,
                        message.payload.delay,
                        message.payload.removeReposts,
                        message.payload.removeLikes
                    );
                }
            });
        }
    });
}

let isProcessRunning = false;

function clearState() {
    chrome.storage.local.remove(['x_deleter_process']);
    isProcessRunning = false;
    chrome.runtime.sendMessage({ action: "STOP_TASK" });
}

async function startPurgeProcess(count, direction, forever, delay, removeReposts, removeLikes, initialProcessedCount, initialReloadedCount) {
    if (isProcessRunning) return;
    isProcessRunning = true;
    initialProcessedCount = initialProcessedCount || 0;
    initialReloadedCount = initialReloadedCount || 0;

    const displayTotal = forever ? "∞" : count;
    injectOverlay("Purging Tweets", displayTotal, initialProcessedCount);

    let processedCount = initialProcessedCount;
    let fallbackScrolls = 0;
    let reloadedCount = initialReloadedCount;

    const saveState = () => {
        chrome.storage.local.set({
            x_deleter_process: {
                running: true, type: "START_PURGE",
                count, direction, forever, delay, removeReposts, removeLikes,
                processedCount, reloadedCount
            }
        });
    };

    saveState();

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
        if (!isProcessRunning) break;

        const cells = Array.from(document.querySelectorAll('[data-testid="cellInnerDiv"]')).filter(cell => {
            return cell.querySelector('[data-testid="caret"]') || 
                   cell.querySelector('[data-testid="unretweet"]') ||
                   cell.querySelector('[data-testid="unlike"]');
        });

        if (cells.length === 0) {
            if (fallbackScrolls > 5) {
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
            window.scrollBy(0, 800);
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
            updateOverlayCount(processedCount, displayTotal);
        } else {
            window.scrollBy(0, 300);
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
    if (isProcessRunning) return;
    isProcessRunning = true;
    initialProcessedCount = initialProcessedCount || 0;
    initialReloadedCount = initialReloadedCount || 0;

    const displayTotal = forever ? "∞" : count;
    injectOverlay("Unfollowing Accounts", displayTotal, initialProcessedCount);

    let processedCount = initialProcessedCount;
    let fallbackScrolls = 0;
    let reloadedCount = initialReloadedCount;

    const saveState = () => {
        chrome.storage.local.set({
            x_deleter_process: {
                running: true, type: "START_UNFOLLOW",
                count, forever, delay, includeBlock,
                processedCount, reloadedCount
            }
        });
    };

    saveState();

    // Navigate to Following page
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
        return; // Page will reload, process will resume from storage
    }

    await waitForElement('[data-testid="UserCell"]', 10000);
    await new Promise(r => setTimeout(r, 1000));

    while (forever || processedCount < count) {
        if (!isProcessRunning) break;

        const users = Array.from(document.querySelectorAll('[data-testid="UserCell"]')).filter(user => {
            return !user.hasAttribute('data-x-processed') && 
                   (user.querySelector('[data-testid$="-unfollow"]') || user.querySelector('[data-testid="caret"]'));
        });

        if (users.length === 0) {
            if (fallbackScrolls > 5) {
                updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
                clearState();
                break;
            }
            window.scrollBy(0, 800);
            fallbackScrolls++;
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        fallbackScrolls = 0;
        let userContainer = users[0];
        let actionTaken = false;
        userContainer.setAttribute('data-x-processed', 'true');

        // Try to Unfollow
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

        // Try to Block if requested
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
            updateOverlayCount(processedCount, displayTotal);
        } else {
            // If no action taken, we still marked it as processed to skip it
            continue;
        }

        await new Promise(r => setTimeout(r, delay));
    }


    if (forever || processedCount >= count) {
        updateOverlay(`Completed! Processed: ${processedCount}/${displayTotal}`);
        clearState();
    }
}

// ---------------- Helpers ----------------

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

let overlayEl;
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
        updateOverlay("Process Stopped Manually");
    };
    overlayEl.appendChild(stopBtn);
    document.body.appendChild(overlayEl);
}

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
        } else if (text.includes("Failed")) {
            overlayEl.style.backgroundColor = '#f4212e';
            if (stopBtn) stopBtn.remove();
        }
    }
}

