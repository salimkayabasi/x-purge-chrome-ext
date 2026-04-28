document.getElementById('forever').addEventListener('change', (e) => {
    document.getElementById('count').disabled = e.target.checked;
});

document.getElementById('startBtn').addEventListener('click', () => {
    const count = parseInt(document.getElementById('count').value, 10);
    const direction = document.getElementById('direction').value;
    const mode = document.getElementById('mode').value;
    const forever = document.getElementById('forever').checked;
    const delay = parseInt(document.getElementById('delay').value, 10) || 2000;
    const removeReposts = document.getElementById('removeReposts').checked;
    const removeLikes = document.getElementById('removeLikes').checked;
    
    if (!forever && (!count || count < 1)) {
        alert("Please enter a valid count.");
        return;
    }

    const startBtn = document.getElementById('startBtn');
    startBtn.disabled = true;
    startBtn.innerText = "Starting...";
    
    document.getElementById('status').innerText = "Connecting to background...";
    document.getElementById('status').style.color = "#00ba7c";

    chrome.runtime.sendMessage({
        action: "START_DELETION",
        payload: {
            count,
            direction,
            mode,
            forever,
            delay,
            removeReposts,
            removeLikes
        }
    }, (response) => {
        if (response && response.success) {
            document.getElementById('status').innerText = "Task Dispatched!";
            setTimeout(() => {
                window.close();
            }, 1000);
        } else {
            startBtn.disabled = false;
            startBtn.innerText = "Start Deletion";
            document.getElementById('status').innerText = response?.error || "Failed to start.";
            document.getElementById('status').style.color = "#f4212e";
        }
    });
});
