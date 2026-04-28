if (typeof window.xDeleterInjected === 'undefined') {
    window.xDeleterInjected = true;

    // Check for resumed process on load
    chrome.storage.local.get(['x_deleter_process'], (result) => {
        if (result.x_deleter_process && result.x_deleter_process.running) {
            const p = result.x_deleter_process;
            startProcess(
                p.count,
                p.direction,
                p.forever,
                p.delay,
                p.removeReposts,
                p.removeLikes,
                p.deletedCount,
                p.reloadedCount || 0
            );
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "EXECUTE") {
            // Clear any old state before starting fresh
            chrome.storage.local.remove(['x_deleter_process'], () => {
                startProcess(
                    message.payload.count,
                    message.payload.direction,
                    message.payload.forever,
                    message.payload.delay,
                    message.payload.removeReposts,
                    message.payload.removeLikes
                );
            });
        }
    });
}

let isProcessRunning = false;

function clearState() {
    chrome.storage.local.remove(['x_deleter_process']);
    isProcessRunning = false;
    chrome.runtime.sendMessage({ action: "STOP_DELETION" });
}

async function startProcess(count, direction, forever, delay, removeReposts, removeLikes, initialDeletedCount, initialReloadedCount) {
    if (isProcessRunning) return;
    isProcessRunning = true;
    initialDeletedCount = initialDeletedCount || 0;
    initialReloadedCount = initialReloadedCount || 0;

    const displayTotal = forever ? "∞" : count;
    injectOverlay(displayTotal, initialDeletedCount);

    let deletedCount = initialDeletedCount;
    let fallbackScrolls = 0;
    let reloadedCount = initialReloadedCount;

    // Helper to persist current state
    const saveState = () => {
        chrome.storage.local.set({
            x_deleter_process: {
                running: true,
                count, direction, forever, delay, removeReposts, removeLikes,
                deletedCount,
                reloadedCount
            }
        });
    };

    saveState();

    // Wait for the React app to render the sidebar profile link
    const profileLink = await waitForElement('a[data-testid="AppTabBar_Profile_Link"]', 10000);

    if (!profileLink) {
        updateOverlay("Failed to find Profile Link. Are you logged in?");
        clearState();
        return;
    }

    // If we're not already on the profile page, click to navigate
    const profilePath = new URL(profileLink.href).pathname;
    if (window.location.pathname !== profilePath) {
        profileLink.click();
        // Wait for the timeline to load and show tweets
        await waitForElement('[data-testid="cellInnerDiv"]', 10000);
    }

    // Extra small buffer to ensure X's virtualized list has fully settled in the DOM
    await new Promise(r => setTimeout(r, 1000));

    // Deletion Loop
    while (forever || deletedCount < count) {
        if (!isProcessRunning) break;

        // Find all potential tweet/repost cells that have actionable buttons
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
                    updateOverlay("No tweets found. Reloading to be sure...");
                    await new Promise(r => setTimeout(r, 1500));
                    location.reload();
                    return; // Stop current execution as page is reloading
                }
                updateOverlay(`No more tweets found. Processed: ${deletedCount}/${displayTotal}`);
                clearState();
                break;
            }
            window.scrollBy(0, 800);
            fallbackScrolls++;
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        fallbackScrolls = 0;

        // Grab the appropriate target cell
        let tweetContainer = direction === "oldest" ? cells[cells.length - 1] : cells[0];
        let targetCaret = tweetContainer.querySelector('[data-testid="caret"]');
        let actionTaken = false;

        // 1. FAST-TRACK: Try quick Unlike first
        let unlikeBtn = tweetContainer.querySelector('[data-testid="unlike"]');
        if (removeLikes && unlikeBtn) {
            unlikeBtn.click();
            actionTaken = true;
        }

        // 2. FAST-TRACK: Try quick Repost Undo if we didn't just unlike
        if (!actionTaken && removeReposts) {
            let unretweetBtn = tweetContainer.querySelector('[data-testid="unretweet"]');
            if (unretweetBtn) {
                unretweetBtn.click();

                // Wait for dropdown menu to appear and find "Undo Repost" / "Repost'u Geri Al"
                let undoBtn = await waitForElement('[data-testid="unretweetConfirm"]', 1500);
                
                if (!undoBtn) {
                    const dropMenuItems = document.querySelectorAll('[role="menuitem"], [data-testid="Dropdown"]');
                    undoBtn = Array.from(dropMenuItems).find(el => 
                        /undo repost|repost'u geri al|geri al/i.test(el.textContent)
                    );
                }

                if (undoBtn) {
                    undoBtn.click();
                    actionTaken = true;
                } else {
                    // Failed to find confirm button, close menu
                    document.body.click();
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }

        // 3. FALLBACK: Open "More" (caret) menu and try to Delete if it's our own text post
        if (!actionTaken && targetCaret) {
            targetCaret.click();

            // Wait for dropdown menu to appear
            await new Promise(r => setTimeout(r, 700));

            // Find the 'Delete' option in the menu
            const menuItems = document.querySelectorAll('[role="menuitem"]');
            let deleteBtn = Array.from(menuItems).find(el => el.textContent.includes('Delete'));

            if (deleteBtn) {
                deleteBtn.click();

                // Wait for the confirmation dialog
                await new Promise(r => setTimeout(r, 700));

                const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                if (confirmBtn) {
                    confirmBtn.click();
                    actionTaken = true;
                } else {
                    document.body.click(); // close sheet if stuck
                }
            } else {
                // No delete button. Close the menu.
                document.body.click();
                await new Promise(r => setTimeout(r, 400));
            }
        }

        if (actionTaken) {
            deletedCount++;
            saveState(); // Update count in storage
            updateOverlayCount(deletedCount, displayTotal);
        } else {
            // Nothing worked on this tweet. Skip it by scrolling out of view.
            window.scrollBy(0, 300);
            await new Promise(r => setTimeout(r, 1000));
            continue; // Skip normal delay, move onto next immediately
        }

        // Wait for X to confirm deletion/undo/unlike and remove the DOM node with the parametrized delay
        await new Promise(r => setTimeout(r, delay));
    }

    if (forever || deletedCount >= count) {
        updateOverlay(`Completed! Processed: ${deletedCount}/${displayTotal}`);
        clearState();
    }
}

// ---------------- Helpers ----------------

function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Timeout fallback
        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

let overlayEl;
function injectOverlay(total, current) {
    current = current || 0;
    if (document.getElementById('x-deleter-overlay')) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'x-deleter-overlay';
    overlayEl.style.position = 'fixed';
    overlayEl.style.top = '0';
    overlayEl.style.left = '0';
    overlayEl.style.width = '100%';
    overlayEl.style.backgroundColor = '#1d9bf0'; // X Blue
    overlayEl.style.color = '#fff';
    overlayEl.style.display = 'flex';
    overlayEl.style.justifyContent = 'center';
    overlayEl.style.alignItems = 'center';
    overlayEl.style.gap = '20px';
    overlayEl.style.padding = '10px 15px';
    overlayEl.style.fontSize = '18px';
    overlayEl.style.fontWeight = 'bold';
    overlayEl.style.zIndex = '9999999';
    overlayEl.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    overlayEl.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    const textEl = document.createElement('span');
    textEl.id = 'x-deleter-text';
    textEl.innerText = `⚠️ X-Deleter Working... Processed: ${current}/${total}`;
    overlayEl.appendChild(textEl);

    const stopBtn = document.createElement('button');
    stopBtn.id = 'x-deleter-stop-btn';
    stopBtn.innerText = "Stop Process";
    stopBtn.style.backgroundColor = "#fff";
    stopBtn.style.color = "#f4212e";
    stopBtn.style.border = "none";
    stopBtn.style.padding = "6px 16px";
    stopBtn.style.borderRadius = "9999px";
    stopBtn.style.cursor = "pointer";
    stopBtn.style.fontSize = "14px";
    stopBtn.style.fontWeight = "bold";
    stopBtn.style.transition = "background-color 0.2s";
    
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
        textEl.innerText = `⚠️ X-Deleter Working... Processed: ${current}/${total}`;
    }
}

function updateOverlay(text) {
    const textEl = document.getElementById('x-deleter-text');
    const stopBtn = document.getElementById('x-deleter-stop-btn');

    if (textEl) {
        textEl.innerText = text;
    }

    if (overlayEl) {
        if (text.includes("Completed") || text.includes("No more tweets") || text.includes("Stopped")) {
            overlayEl.style.backgroundColor = '#00ba7c'; // Green
            if (stopBtn) stopBtn.remove(); // Hide stop button when done
        } else if (text.includes("Failed")) {
            overlayEl.style.backgroundColor = '#f4212e'; // Red
            if (stopBtn) stopBtn.remove();
        }
    }
}
