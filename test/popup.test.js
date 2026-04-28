beforeEach(() => {
    jest.resetModules();
    
    document.body.innerHTML = `
        <input type="checkbox" id="forever">
        <input type="number" id="count" value="10">
        <select id="direction"><option value="newest">newest</option></select>
        <select id="mode"><option value="foreground">foreground</option></select>
        <input type="number" id="delay" value="2000">
        <input type="checkbox" id="removeReposts">
        <input type="checkbox" id="removeLikes">
        <button id="startBtn">Start Deletion</button>
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

test("clicking startBtn with invalid count shows alert", () => {
    window.alert = jest.fn();
    require("../src/popup.js");
    
    document.getElementById('count').value = "-1";
    document.getElementById('startBtn').click();
    
    expect(window.alert).toHaveBeenCalledWith("Please enter a valid count.");
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
});

test("clicking startBtn sends message and handles success response", () => {
    jest.useFakeTimers();
    window.close = jest.fn();
    require("../src/popup.js");
    
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true });
    });
    
    document.getElementById('startBtn').click();
    
    expect(document.getElementById('startBtn').disabled).toBe(true);
    expect(document.getElementById('status').innerText).toBe("Task Dispatched!");
    
    jest.advanceTimersByTime(1000);
    expect(window.close).toHaveBeenCalled();
    jest.useRealTimers();
});

test("clicking startBtn sends message and handles error response", () => {
    require("../src/popup.js");
    
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ error: "Something went wrong" });
    });
    
    document.getElementById('startBtn').click();
    
    expect(document.getElementById('startBtn').disabled).toBe(false);
    expect(document.getElementById('status').innerText).toBe("Something went wrong");
});

test("clicking startBtn with empty delay uses fallback 2000", () => {
    require("../src/popup.js");
    document.getElementById('delay').value = "";
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {});
    
    document.getElementById('startBtn').click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ delay: 2000 }) }),
        expect.any(Function)
    );
});

test("clicking startBtn with null response handles default error", () => {
    require("../src/popup.js");
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback(null); // null response
    });
    
    document.getElementById('startBtn').click();
    expect(document.getElementById('status').innerText).toBe("Failed to start.");
});
