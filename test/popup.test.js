beforeEach(() => {
    jest.resetModules();
    
    document.body.innerHTML = `
        <div class="tabs">
            <button class="tab-btn active" data-tab="purge-view">Purge Tweets</button>
            <button class="tab-btn" data-tab="unfollow-view">Unfollow</button>
            <button class="tab-btn" data-tab="dislike-view">Dislike</button>
            <button class="tab-btn" data-tab="bookmark-view">Unbookmark</button>
        </div>
        <div id="purge-view" class="tab-content active">
            <input type="checkbox" id="forever">
            <input type="number" id="count" value="10">
            <select id="direction"><option value="newest">newest</option></select>
            <select id="mode"><option value="foreground">foreground</option></select>
            <input type="number" id="delay" value="2000">
            <input type="checkbox" id="removeReposts">
            <input type="checkbox" id="removeLikes">
            <button id="startPurgeBtn">Start Deletion</button>
        </div>
        <div id="unfollow-view" class="tab-content">
            <input type="checkbox" id="unfollowForever">
            <input type="number" id="unfollowCount" value="10">
            <input type="number" id="unfollowDelay" value="2000">
            <input type="checkbox" id="includeBlock">
            <select id="unfollowMode"><option value="foreground">foreground</option></select>
            <button id="startUnfollowBtn">Start Unfollowing</button>
        </div>
        <div id="dislike-view" class="tab-content">
            <input type="checkbox" id="dislikeForever">
            <input type="number" id="dislikeCount" value="10">
            <input type="number" id="dislikeDelay" value="2000">
            <select id="dislikeMode"><option value="foreground">foreground</option></select>
            <button id="startDislikeBtn">Start Disliking</button>
        </div>
        <div id="bookmark-view" class="tab-content">
            <input type="checkbox" id="bookmarkForever">
            <input type="number" id="bookmarkCount" value="10">
            <input type="number" id="bookmarkDelay" value="2000">
            <select id="bookmarkMode"><option value="foreground">foreground</option></select>
            <button id="startBookmarkBtn">Start Unbookmarking</button>
        </div>
        <div id="status"></div>
    `;

    global.chrome = {
        runtime: {
            sendMessage: jest.fn(),
        }
    };
});

test("toggling forever checkbox disables count input", () => {
    require("../src/popup.js");
    const forever = document.getElementById('forever');
    const count = document.getElementById('count');
    
    expect(count.disabled).toBe(false);
    
    forever.checked = true;
    forever.dispatchEvent(new Event('change'));
    expect(count.disabled).toBe(true);
    
    forever.checked = false;
    forever.dispatchEvent(new Event('change'));
    expect(count.disabled).toBe(false);
});

test("clicking startPurgeBtn with invalid count shows alert", () => {
    window.alert = jest.fn();
    require("../src/popup.js");
    
    document.getElementById('count').value = "-1";
    document.getElementById('startPurgeBtn').click();
    
    expect(window.alert).toHaveBeenCalledWith("Please enter a valid count.");
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
});

test("clicking startPurgeBtn sends message and handles success response", () => {
    jest.useFakeTimers();
    window.close = jest.fn();
    require("../src/popup.js");
    
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true });
    });
    
    document.getElementById('startPurgeBtn').click();
    
    expect(document.getElementById('startPurgeBtn').disabled).toBe(true);
    expect(document.getElementById('status').innerText).toBe("Task Dispatched!");
    
    jest.advanceTimersByTime(1000);
    expect(window.close).toHaveBeenCalled();
    jest.useRealTimers();
});

test("clicking startPurgeBtn handles error response", () => {
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ error: "Fail" });
    });
    document.getElementById('startPurgeBtn').click();
    expect(document.getElementById('status').innerText).toBe("Fail");
    expect(document.getElementById('startPurgeBtn').disabled).toBe(false);
});

test("clicking startPurgeBtn handles null response", () => {
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback(null);
    });
    document.getElementById('startPurgeBtn').click();
    expect(document.getElementById('status').innerText).toBe("Failed to start.");
});

test("clicking startPurgeBtn uses default delay if empty", () => {
    require("../src/popup.js");
    document.getElementById('delay').value = "";
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {});
    document.getElementById('startPurgeBtn').click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ delay: 2000 }) }),
        expect.any(Function)
    );
});

test("toggling unfollowForever checkbox disables unfollowCount input", () => {
    require("../src/popup.js");
    const forever = document.getElementById('unfollowForever');
    const count = document.getElementById('unfollowCount');
    
    expect(count.disabled).toBe(false);
    forever.checked = true;
    forever.dispatchEvent(new Event('change'));
    expect(count.disabled).toBe(true);
});

test("clicking startUnfollowBtn with invalid count shows alert", () => {
    window.alert = jest.fn();
    require("../src/popup.js");
    document.getElementById('unfollowCount').value = "0";
    document.getElementById('startUnfollowBtn').click();
    expect(window.alert).toHaveBeenCalled();
});

test("clicking startUnfollowBtn handles success response", () => {
    jest.useFakeTimers();
    window.close = jest.fn();
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true });
    });
    document.getElementById('startUnfollowBtn').click();
    expect(document.getElementById('status').innerText).toBe("Task Dispatched!");
    jest.advanceTimersByTime(1000);
    expect(window.close).toHaveBeenCalled();
    jest.useRealTimers();
});

test("clicking startUnfollowBtn handles error response", () => {
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ error: "Fail" });
    });
    document.getElementById('startUnfollowBtn').click();
    expect(document.getElementById('status').innerText).toBe("Fail");
    expect(document.getElementById('startUnfollowBtn').disabled).toBe(false);
});

test("tab switching works", () => {
    require("../src/popup.js");
    const unfollowBtn = document.querySelector('.tab-btn[data-tab="unfollow-view"]');
    const purgeBtn = document.querySelector('.tab-btn[data-tab="purge-view"]');
    
    unfollowBtn.click();
    expect(unfollowBtn.classList.contains('active')).toBe(true);
    expect(document.getElementById('unfollow-view').classList.contains('active')).toBe(true);
    
    purgeBtn.click();
    expect(purgeBtn.classList.contains('active')).toBe(true);
});

test("clicking startDislikeBtn handles success response", () => {
    jest.useFakeTimers();
    window.close = jest.fn();
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true });
    });
    document.getElementById('startDislikeBtn').click();
    expect(document.getElementById('status').innerText).toBe("Task Dispatched!");
    jest.advanceTimersByTime(1000);
    expect(window.close).toHaveBeenCalled();
    jest.useRealTimers();
});

test("clicking startBookmarkBtn handles success response", () => {
    jest.useFakeTimers();
    window.close = jest.fn();
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true });
    });
    document.getElementById('startBookmarkBtn').click();
    expect(document.getElementById('status').innerText).toBe("Task Dispatched!");
    jest.advanceTimersByTime(1000);
    expect(window.close).toHaveBeenCalled();
    jest.useRealTimers();
});

test("toggling bookmarkForever checkbox disables bookmarkCount input", () => {
    require("../src/popup.js");
    const forever = document.getElementById('bookmarkForever');
    const count = document.getElementById('bookmarkCount');
    
    expect(count.disabled).toBe(false);
    forever.checked = true;
    forever.dispatchEvent(new Event('change'));
    expect(count.disabled).toBe(true);
});

test("clicking startBookmarkBtn handles error response", () => {
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ error: "Fail" });
    });
    document.getElementById('startBookmarkBtn').click();
    expect(document.getElementById('status').innerText).toBe("Fail");
    expect(document.getElementById('startBookmarkBtn').disabled).toBe(false);
});

test("clicking startBookmarkBtn with invalid count shows alert", () => {
    window.alert = jest.fn();
    require("../src/popup.js");
    document.getElementById('bookmarkCount').value = "0";
    document.getElementById('startBookmarkBtn').click();
    expect(window.alert).toHaveBeenCalled();
});

test("clicking startDislikeBtn handles error response", () => {
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ error: "Fail" });
    });
    document.getElementById('startDislikeBtn').click();
    expect(document.getElementById('status').innerText).toBe("Fail");
    expect(document.getElementById('startDislikeBtn').disabled).toBe(false);
});




