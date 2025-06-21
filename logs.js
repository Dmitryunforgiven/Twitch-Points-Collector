document.addEventListener("DOMContentLoaded", () => {
  const logContainer = document.getElementById("logContainer");
  const clearButton = document.getElementById("clearLogs");
  let autoScroll = true;

  function formatLogEntry(log) {
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry ${log.level}`;
    
    const timestamp = document.createElement("span");
    timestamp.className = "timestamp";
    timestamp.textContent = `[${log.timestamp}]`;
    
    const level = document.createElement("span");
    level.className = "level";
    level.textContent = log.level.toUpperCase();
    
    const message = document.createElement("span");
    message.className = "message";
    message.textContent = log.message;
    
    logEntry.appendChild(timestamp);
    logEntry.appendChild(level);
    logEntry.appendChild(message);
    
    return logEntry;
  }

  function appendLog(log) {
    const logEntry = formatLogEntry(log);
    logContainer.appendChild(logEntry);
    
    while (logContainer.children.length > 500) {
      logContainer.removeChild(logContainer.firstChild);
    }
    
    if (autoScroll) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }

  function loadLogs() {
    chrome.storage.local.get(["logs"], (result) => {
      const logs = result.logs || [];
      console.log(`Loaded ${logs.length} log entries`);
      
      logContainer.innerHTML = "";
      logs.forEach((log) => appendLog(log));
      
      if (logs.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "log-entry info";
        emptyMessage.textContent = "Logs empty";
        logContainer.appendChild(emptyMessage);
      }
    });
  }

  logContainer.addEventListener("scroll", () => {
    const isAtBottom = logContainer.scrollTop + logContainer.clientHeight >= logContainer.scrollHeight - 10;
    autoScroll = isAtBottom;
  });

  loadLogs();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "log") {
      appendLog(message.log);
      console.log("Новый лог получен:", message.log);
    }
  });

  clearButton.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all logs?")) {
      chrome.storage.local.set({ logs: [] }, () => {
        logContainer.innerHTML = "";
        const clearedMessage = document.createElement("div");
        clearedMessage.className = "log-entry info";
        clearedMessage.textContent = "Logs cleared";
        logContainer.appendChild(clearedMessage);
        console.log("Logs cleared");
      });
    }
  });

  const filterContainer = document.createElement("div");
  filterContainer.style.marginBottom = "10px";
  
  const filterButtons = [
    { text: "All", level: "all" },
    { text: "Info", level: "info" },
    { text: "Warning", level: "warning" },
    { text: "Error", level: "error" }
  ];

  filterButtons.forEach(filter => {
    const button = document.createElement("button");
    button.textContent = filter.text;
    button.style.marginRight = "5px";
    button.style.padding = "5px 10px";
    button.style.fontSize = "12px";
    
    if (filter.level === "all") {
      button.style.backgroundColor = "#6441a5";
      button.style.color = "white";
    } else {
      button.style.backgroundColor = "#f0f0f0";
      button.style.color = "#333";
    }
    
    button.addEventListener("click", () => {
      filterContainer.querySelectorAll("button").forEach(btn => {
        btn.style.backgroundColor = "#f0f0f0";
        btn.style.color = "#333";
      });
      
      button.style.backgroundColor = "#6441a5";
      button.style.color = "white";
      
      const allEntries = logContainer.querySelectorAll(".log-entry");
      allEntries.forEach(entry => {
        if (filter.level === "all" || entry.classList.contains(filter.level)) {
          entry.style.display = "block";
        } else {
          entry.style.display = "none";
        }
      });
      
      console.log(`Filter applied: ${filter.level}`);
    });
    
    filterContainer.appendChild(button);
  });

  logContainer.parentNode.insertBefore(filterContainer, logContainer);

  /*const exportButton = document.createElement("button");
  exportButton.textContent = "Export Logs";
  exportButton.style.marginLeft = "10px";
  exportButton.addEventListener("click", () => {
    chrome.storage.local.get(["logs"], (result) => {
      const logs = result.logs || [];
      const logText = logs.map(log => 
        `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
      ).join("\n");
      
      const blob = new Blob([logText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `twitch-logs-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      
      console.log("Logs exported");
    });
  });*/

  clearButton.parentNode.insertBefore(exportButton, clearButton.nextSibling);

  const statsContainer = document.createElement("div");
  statsContainer.style.marginTop = "10px";
  statsContainer.style.fontSize = "12px";
  statsContainer.style.color = "#666";
  
  function updateStats() {
    chrome.storage.local.get(["logs"], (result) => {
      const logs = result.logs || [];
      const stats = {
        total: logs.length,
        info: logs.filter(log => log.level === "info").length,
        warning: logs.filter(log => log.level === "warning").length,
        error: logs.filter(log => log.level === "error").length
      };
      
      statsContainer.textContent = `Total: ${stats.total} | Info: ${stats.info} | Warning: ${stats.warning} | Error: ${stats.error}`;
    });
  }
  
  updateStats();
  setInterval(updateStats, 5000);
  
  logContainer.parentNode.appendChild(statsContainer);

  console.log("Logs window initialized");
});