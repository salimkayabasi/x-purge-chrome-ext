// Tab Switching Logic
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        
        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');
        
        // Clear status
        document.getElementById('status').innerText = "";
    });
});

// Purge Tweets Logic
document.getElementById('forever').addEventListener('change', (e) => {
    document.getElementById('count').disabled = e.target.checked;
});

document.getElementById('startPurgeBtn').addEventListener('click', () => {
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

    const startBtn = document.getElementById('startPurgeBtn');
    startBtn.disabled = true;
    startBtn.innerText = "Starting...";
    
    document.getElementById('status').innerText = "Connecting to background...";
    document.getElementById('status').style.color = "#1d9bf0";

    chrome.runtime.sendMessage({
        action: "START_PURGE",
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

// Unfollow Logic
document.getElementById('unfollowForever').addEventListener('change', (e) => {
    document.getElementById('unfollowCount').disabled = e.target.checked;
});

document.getElementById('startUnfollowBtn').addEventListener('click', () => {
    const count = parseInt(document.getElementById('unfollowCount').value, 10);
    const forever = document.getElementById('unfollowForever').checked;
    const delay = parseInt(document.getElementById('unfollowDelay').value, 10) || 2000;
    const includeBlock = document.getElementById('includeBlock').checked;
    const mode = document.getElementById('unfollowMode').value;

    if (!forever && (!count || count < 1)) {
        alert("Please enter a valid count.");
        return;
    }

    const startBtn = document.getElementById('startUnfollowBtn');
    startBtn.disabled = true;
    startBtn.innerText = "Starting...";
    
    document.getElementById('status').innerText = "Connecting to background...";
    document.getElementById('status').style.color = "#1d9bf0";

    chrome.runtime.sendMessage({
        action: "START_UNFOLLOW",
        payload: {
            count,
            forever,
            delay,
            includeBlock,
            mode
        }
    }, (response) => {
        if (response && response.success) {
            document.getElementById('status').innerText = "Task Dispatched!";
            setTimeout(() => {
                window.close();
            }, 1000);
        } else {
            startBtn.disabled = false;
            startBtn.innerText = "Start Unfollowing";
            document.getElementById('status').innerText = response?.error || "Failed to start.";
            document.getElementById('status').style.color = "#f4212e";
        }
    });
});

// Dislike Logic
document.getElementById('dislikeForever').addEventListener('change', (e) => {
    document.getElementById('dislikeCount').disabled = e.target.checked;
});

document.getElementById('startDislikeBtn').addEventListener('click', () => {
    const count = parseInt(document.getElementById('dislikeCount').value, 10);
    const forever = document.getElementById('dislikeForever').checked;
    const delay = parseInt(document.getElementById('dislikeDelay').value, 10) || 2000;
    const mode = document.getElementById('dislikeMode').value;

    if (!forever && (!count || count < 1)) {
        alert("Please enter a valid count.");
        return;
    }

    const startBtn = document.getElementById('startDislikeBtn');
    startBtn.disabled = true;
    startBtn.innerText = "Starting...";
    
    document.getElementById('status').innerText = "Connecting to background...";
    document.getElementById('status').style.color = "#1d9bf0";

    chrome.runtime.sendMessage({
        action: "START_DISLIKE",
        payload: {
            count,
            forever,
            delay,
            mode
        }
    }, (response) => {
        if (response && response.success) {
            document.getElementById('status').innerText = "Task Dispatched!";
            setTimeout(() => {
                window.close();
            }, 1000);
        } else {
            startBtn.disabled = false;
            startBtn.innerText = "Start Disliking";
            document.getElementById('status').innerText = response?.error || "Failed to start.";
            document.getElementById('status').style.color = "#f4212e";
        }
    });
});

// Bookmark Logic
document.getElementById('bookmarkForever').addEventListener('change', (e) => {
    document.getElementById('bookmarkCount').disabled = e.target.checked;
});

document.getElementById('startBookmarkBtn').addEventListener('click', () => {
    const count = parseInt(document.getElementById('bookmarkCount').value, 10);
    const forever = document.getElementById('bookmarkForever').checked;
    const delay = parseInt(document.getElementById('bookmarkDelay').value, 10) || 2000;
    const mode = document.getElementById('bookmarkMode').value;

    if (!forever && (!count || count < 1)) {
        alert("Please enter a valid count.");
        return;
    }

    const startBtn = document.getElementById('startBookmarkBtn');
    startBtn.disabled = true;
    startBtn.innerText = "Starting...";
    
    document.getElementById('status').innerText = "Connecting to background...";
    document.getElementById('status').style.color = "#1d9bf0";

    chrome.runtime.sendMessage({
        action: "START_UNBOOKMARK",
        payload: {
            count,
            forever,
            delay,
            mode
        }
    }, (response) => {
        if (response && response.success) {
            document.getElementById('status').innerText = "Task Dispatched!";
            setTimeout(() => {
                window.close();
            }, 1000);
        } else {
            startBtn.disabled = false;
            startBtn.innerText = "Start Unbookmarking";
            document.getElementById('status').innerText = response?.error || "Failed to start.";
            document.getElementById('status').style.color = "#f4212e";
        }
    });
});
