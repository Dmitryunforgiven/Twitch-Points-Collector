document.addEventListener("DOMContentLoaded", () => {
  const autostartToggle = document.getElementById("autostartToggle");
  const status = document.getElementById("status");
  const statusIndicator = document.getElementById("statusIndicator");
  const mainActionButton = document.getElementById("mainAction");
  const channelCount = document.getElementById("channelCount");
  const openTabs = document.getElementById("openTabs");
  const checkInterval = document.getElementById("checkInterval");
  const lastCheck = document.getElementById("lastCheck");

  let currentStatus = {
    isRunning: false,
    hasToken: false,
    channelCount: 0,
    openTabs: 0,
    interval: 300
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "statusChanged") {
      console.log("Received status update from the background:", message);
      currentStatus.isRunning = message.isRunning;
      updateUI();
    }
  });

  function updateStatus(message, type = "info") {
    status.textContent = message;
    
    statusIndicator.className = "status-indicator";
    if (type === "active") {
      statusIndicator.classList.add("active");
    } else if (type === "error") {
      statusIndicator.classList.add("warning");
    } else {
      statusIndicator.classList.add("inactive");
    }
    
    console.log("Status updated:", message, type);
  }

  function updateUI() {
    channelCount.textContent = currentStatus.channelCount;
    openTabs.textContent = currentStatus.openTabs;
    checkInterval.textContent = `${currentStatus.interval}с`;
    
    if (currentStatus.channelCount === 0) {
      mainActionButton.textContent = "Setup Channels";
      mainActionButton.disabled = false;
      updateStatus("Channels are not set up", "error");
    } else if (!currentStatus.hasToken) {
      mainActionButton.textContent = "Authorize";
      mainActionButton.disabled = false;
      updateStatus("Authorization is required", "error");
    } else if (currentStatus.isRunning) {
      mainActionButton.textContent = "Stop Monitoring";
      mainActionButton.disabled = false;
      updateStatus(`Monitoring is active, (${currentStatus.openTabs} tabs)`, "active");
    } else {
      mainActionButton.textContent = "Start Monitoring";
      mainActionButton.disabled = false;
      updateStatus("Ready to start", "inactive");
    }
  }

  function loadSettings() {
  chrome.storage.local.get(["autostart", "channels", "oAuth", "delay"], (result) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading settings:", chrome.runtime.lastError);
      updateStatus("Error loading settings", "error");
      return;
    }

    autostartToggle.checked = result.autostart !== false;
    currentStatus.channelCount = result.channels ? result.channels.length : 0;
    currentStatus.hasToken = !!result.oAuth;
    currentStatus.interval = result.delay || 300;
    
    console.log("Settings loaded from storage:", {
      channels: currentStatus.channelCount,
      hasToken: currentStatus.hasToken,
      interval: currentStatus.interval
    });
    
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting status:", chrome.runtime.lastError);
        updateStatus("Error getting status", "error");
        return;
      }
      
      console.log("Status response from background:", response);
      
      if (response) {
        currentStatus.isRunning = response.isRunning;
        currentStatus.openTabs = response.openTabs || 0;
        currentStatus.hasToken = response.hasToken;
      }
      
      console.log("Final currentStatus:", currentStatus);
      updateUI();
    });
  });
}

  autostartToggle.addEventListener("change", () => {
    const isAutostart = autostartToggle.checked;
    chrome.storage.local.set({ autostart: isAutostart }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving autostart:", chrome.runtime.lastError);
      } else {
        console.log("Autostart enabled:", isAutostart);
      }
    });
  });

  mainActionButton.addEventListener("click", () => {
    console.log("Main action button clicked");
    
    if (currentStatus.channelCount === 0) {
      console.log("Opening config window");
      chrome.windows.create({
        url: chrome.runtime.getURL("config.html"),
        type: "popup",
        width: 620,
        height: 600
      }, (window) => {
        if (chrome.runtime.lastError) {
          console.error("Error opening config:", chrome.runtime.lastError);
          updateStatus("Error opening config", "error");
        } else {
          console.log("Config window opened:", window.id);
        }
      });
      return;
    }

    if (!currentStatus.hasToken) {
      console.log("Requesting token");
      updateStatus("Requesting authorization token...", "inactive");
      mainActionButton.disabled = true;
      
      chrome.runtime.sendMessage({ action: "refreshToken" }, (response) => {
        mainActionButton.disabled = false;
        if (chrome.runtime.lastError) {
          console.error("Error refreshing token:", chrome.runtime.lastError);
          updateStatus("Error refreshing token", "error");
          return;
        }
        
        if (response && response.error) {
          updateStatus(`Authorization error: ${response.error}`, "error");
        } else {
          currentStatus.hasToken = true;
          updateStatus("Token obtained", "inactive");
          updateUI();
        }
      });
      return;
    }

    if (currentStatus.isRunning) {
      console.log("Stopping monitoring");
      updateStatus("Stopping monitoring...", "inactive");
      chrome.runtime.sendMessage({ action: "stopMonitoring" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error stopping monitoring:", chrome.runtime.lastError);
          updateStatus("Error stopping monitoring", "error");
          return;
        }
        
        if (response && response.success) {
          currentStatus.isRunning = false;
          currentStatus.openTabs = 0;
          updateUI();
        }
      });
    } else {
      console.log("Starting monitoring");
      updateStatus("Starting monitoring...", "inactive");
      chrome.runtime.sendMessage({ action: "startMonitoring" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error starting monitoring:", chrome.runtime.lastError);
          updateStatus("Error starting monitoring", "error");
          return;
        }
        
        if (response && response.success) {
          currentStatus.isRunning = true;
          updateUI();
          setTimeout(() => {
            chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
              if (response) {
                currentStatus.openTabs = response.openTabs || 0;
                updateUI();
              }
            });
          }, 2000);
        }
      });
    }
  });

  document.getElementById("openConfig").addEventListener("click", () => {
    console.log("Opening config");
    chrome.windows.create({
      url: chrome.runtime.getURL("config.html"),
      type: "popup",
      width: 620,
      height: 600
    }, (window) => {
      if (chrome.runtime.lastError) {
        console.error("Error opening config:", chrome.runtime.lastError);
        updateStatus("Error opening config", "error");
      } else {
        console.log("Config window opened:", window.id);
      }
    });
  });

  document.getElementById("openLog").addEventListener("click", () => {
    console.log("Opening logs");
    chrome.windows.create({
      url: chrome.runtime.getURL("logs.html"),
      type: "popup",
      width: 900,
      height: 700
    }, (window) => {
      if (chrome.runtime.lastError) {
        console.error("Error opening logs:", chrome.runtime.lastError);
        updateStatus("Error opening logs", "error");
      } else {
        console.log("Logs window opened:", window.id);
      }
    });
  });

  function updateLastCheck() {
  const now = new Date();
  lastCheck.textContent = now.toLocaleTimeString(navigator.language, {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

  setInterval(() => {
    if (currentStatus.isRunning) {
      chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
        if (!chrome.runtime.lastError && response) {
          const wasRunning = currentStatus.isRunning;
          currentStatus.isRunning = response.isRunning;
          currentStatus.openTabs = response.openTabs || 0;
          
          if (wasRunning !== currentStatus.isRunning) {
            updateUI();
          } else {
            openTabs.textContent = currentStatus.openTabs;
          }
          
          updateLastCheck();
        }
      });
    }
  }, 5000);

  document.getElementById("openStats").addEventListener("click", () => {
      console.log("Opening stats");
      chrome.windows.create({
        url: chrome.runtime.getURL("stats.html"),
        type: "popup",
        width: 800,
        height: 600
      }, (window) => {
        if (chrome.runtime.lastError) {
          console.error("Error opening stats:", chrome.runtime.lastError);
          updateStatus("Error opening stats", "error");
        } else {
          console.log("Stats window opened:", window.id);
        }
      });
    });

  loadSettings();
  updateLastCheck();
});