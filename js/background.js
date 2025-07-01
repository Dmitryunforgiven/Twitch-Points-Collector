let clientId = "";
let userId = "";
let redirectUri = "";
let authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=user:read:follows+user:read:subscriptions`;
let oAuth = "";
let channelStatus = {};
let channelTabs = {};
let channels = [];
let delay = 300;
let intervalId = null;
let channelWindows = {};
let detailedLogging = false;
let showOverlay = false;
let rewardStats = {};
let verificationIntervals = [];
let isMonitoringActive = false;
let isFirstCheck = true;
let keepAliveInterval = null;
let windowSettings = {
  separateWindow: false,
  mute: false,
  minimize: false,
  maximize: false
};
let overlayUpdateInProgress = false;


async function loadApiConfig() {
    const result = await chrome.storage.local.get(['clientId', 'userId', 'redirectUri']);
    if (result.clientId) clientId = result.clientId;
    if (result.userId) userId = result.userId;
    if (result.redirectUri) redirectUri = result.redirectUri;
    
    authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=user:read:follows`;
}


loadApiConfig();

function startKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  
  keepAliveInterval = setInterval(() => {
    chrome.storage.local.get(['keepAlive'], () => {
      if (isMonitoringActive && !intervalId) {
        logMessage("Monitoring interval lost, restarting...", "warning");
        startMonitoringInterval();
      }
    });
  }, 30000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

function startMonitoringInterval() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  
  const delayMs = delay * 1000;
  
  const performCheck = async () => {
    try {
      await getFollowedList();
    } catch (error) {
      logMessage(`Error checking streams: ${error.message}`, "error");
      
      if (error.message.includes('401')) {
        try {
          await refreshUserToken();
        } catch (tokenError) {
          logMessage(`Failed to refresh token: ${tokenError.message}`, "error");
        }
      }
    }
  };
  
  intervalId = setInterval(performCheck, delayMs);
  logMessage(`Monitoring interval set: ${delayMs / 1000} seconds`);
}

chrome.runtime.onStartup.addListener(async () => {
  logMessage("=== AUTOSTART ON BROWSER START ===");
  
  isMonitoringActive = false;
  chrome.storage.local.set({ monitoringActive: false });
  
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(["autostart", "oAuth", "channels", "rewardStats"], resolve);
    });
    
    logMessage(`Startup settings: autostart=${result.autostart !== false}, token=${!!result.oAuth}, channels=${result.channels?.length || 0}`);
    
    if (result.rewardStats) {
      rewardStats = result.rewardStats;
      logMessage("Reward stats loaded from storage");
    }
    
    if (result.oAuth) {
      oAuth = result.oAuth;
      logMessage("Token loaded from storage on startup");
    }
    
    if (result.autostart !== false && result.oAuth && result.channels?.length > 0) {
      logMessage("AUTOSTART ENABLED - monitoring will start in 3 seconds...");
      setTimeout(() => {
        logMessage("Starting automatic monitoring...");
        startChecking().catch(e => 
          logMessage(`Autostart error: ${e.message}`, "error")
        );
      }, 3000);
    } else {
      logMessage("Autostart cancelled. Reasons:", "warning");
      if (result.autostart === false) logMessage("- Autostart disabled in settings", "warning");
      if (!result.channels?.length) logMessage("- No channels to monitor", "warning");
      if (!result.oAuth) logMessage("- Token not authorized", "warning");
    }
  } catch (error) {
    logMessage(`Critical error on autostart: ${error.message}`, "error");
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  logMessage(`=== EXTENSION ${details.reason.toUpperCase()} ===`);
  logMessage(`Version: ${chrome.runtime.getManifest().version}`);
  
  isMonitoringActive = false;
  chrome.storage.local.set({ monitoringActive: false });
  
  try {
    const settings = await new Promise(resolve => {
      chrome.storage.local.get(['rewardStats', 'oAuth'], resolve);
    });
    
    if (settings.rewardStats) {
      rewardStats = settings.rewardStats;
    }
    
    if (settings.oAuth) {
      oAuth = settings.oAuth;
    }
    
    logMessage("Extension is ready to work");
  } catch (error) {
    console.error('Error in onInstalled:', error);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('twitch.tv')) {
    debugLog("New Twitch tab loaded", { tabId, url: tab.url });
    
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        action: "updateChannelOverlay",
        channels: channels,
        liveStreams: [],
        channelStatus: channelStatus
      }, (response) => {
        if (chrome.runtime.lastError) {
          debugLog(`Overlay initialization error on new tab ${tabId}: ${chrome.runtime.lastError.message}`);
        } else {
          debugLog(`Overlay initialized on new tab ${tabId}`);
        }
      });
    }, 2000);
  }
});

function debugLog(message, data = null) {
  if (detailedLogging) {
    if (data) {
      logMessage(`[DEBUG] ${message}: ${JSON.stringify(data)}`, "debug");
    } else {
      logMessage(`[DEBUG] ${message}`, "debug");
    }
  }
}

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get({
      channels: [],
      delay: 300,
      separateWindow: false,
      mute: false,
      minimize: false,
      maximize: false,
      detailedLogging: false,
      showOverlay: true,
      autostart: true,
      channelStatus: {},
      lastStatusUpdate: null
    }, result => {
      console.log("=== Loading settings into background ===");
      console.log("loaded settings:", result);
      
      channels = result.channels || [];
      delay = result.delay || 300;
      detailedLogging = result.detailedLogging || false;
      showOverlay = result.showOverlay !== false;
      

      const lastUpdate = result.lastStatusUpdate;
      const now = Date.now();
      const maxAge = 10 * 60 * 1000;
      
      if (lastUpdate && (now - lastUpdate) < maxAge) {
        channelStatus = result.channelStatus || {};
        logMessage(`Loaded relevant statuses for channels (age: ${Math.round((now - lastUpdate) / 1000)}s)`);
      } else {
        channelStatus = {};
        if (lastUpdate) {
          logMessage(`Saved statuses outdated (age: ${Math.round((now - lastUpdate) / 1000)}s), resetting`, "warning");
        } else {
          logMessage("Saved statuses missing, starting from scratch");
        }
      }
      
      windowSettings = {
        separateWindow: result.separateWindow || false,
        mute: result.mute || false,
        minimize: result.minimize || false,
        maximize: result.maximize || false
      };
      
      console.log("set values:", {
        channels: channels.length,
        delay,
        detailedLogging,
        showOverlay,
        windowSettings,
        channelStatus,
        statusAge: lastUpdate ? Math.round((now - lastUpdate) / 1000) : 'N/A'
      });
      
      logMessage(`Settings loaded: channels ${channels.length}, interval ${delay}s, channels statuses: ${Object.keys(channelStatus).length} active`);
      resolve();
    });
  });
}

function updateRewardStats(channel, success = true, points = 0) {
  if (!channel) return;
  
  const today = new Date().toDateString();
  const now = new Date().toISOString();
  
  if (!rewardStats[channel]) {
    rewardStats[channel] = {
      totalRewards: 0,
      totalPoints: 0,
      errors: 0,
      lastReward: null,
      firstReward: null,
      dailyStats: {},
      subMultiplier: 1.0
    };
  }
  
  if (success) {
    const lastReward = rewardStats[channel].lastReward;
    if (lastReward) {
      const timeSinceLastReward = new Date(now) - new Date(lastReward);
      if (timeSinceLastReward < 5000) {
        console.log(`Skipping duplicate reward for ${channel} (elapsed ${timeSinceLastReward}ms)`);
        return;
      }
    }
    
    const multiplier = rewardStats[channel].subMultiplier || 1.0;
    const calculatedPoints = points * multiplier;

    rewardStats[channel].totalRewards++;
    rewardStats[channel].totalPoints = (rewardStats[channel].totalPoints || 0) + calculatedPoints;
    rewardStats[channel].lastReward = now;
    
    if (!rewardStats[channel].firstReward) {
      rewardStats[channel].firstReward = now;
    }
    
    if (!rewardStats[channel].dailyStats[today]) {
      rewardStats[channel].dailyStats[today] = { rewards: 0, points: 0 };
    }
    rewardStats[channel].dailyStats[today].rewards++;
    rewardStats[channel].dailyStats[today].points += calculatedPoints;
    
    logMessage(`Reward registered for ${channel}. Points: ${calculatedPoints} (Base: ${points}, Multiplier: ${multiplier}). Total points: ${rewardStats[channel].totalPoints}`);
  } else {
    rewardStats[channel].errors++;
    console.log(`Reward collection error for ${channel}. Total errors: ${rewardStats[channel].errors}`);
  }
  
  chrome.storage.local.set({ rewardStats });
  
  chrome.runtime.sendMessage({
    action: "statsUpdated",
    stats: rewardStats,
    channelStatus: channelStatus
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logMessage(`Received message: ${message.action}`);
  logMessage("Message details", { message, senderId: sender.id, tabId: sender.tab?.id });
  
  if (message.action === "refreshToken") {
    logMessage("Token refresh request via popup");
    debugLog("Starting token refresh process");
    refreshUserToken()
      .then((token) => {
        logMessage("Token successfully refreshed via popup");
        debugLog("Token refreshed", { tokenLength: token.length, tokenStart: token.substring(0, 10) });
        sendResponse({ token: token.substring(0, 10) + "..." });
      })
      .catch((error) => {
        logMessage(`Token refresh error via popup: ${error.message}`, "error");
        debugLog("Token refresh error", { error: error.message, stack: error.stack });
        sendResponse({ error: error.message });
      });
    return true;
    
  } else if (message.action === "startMonitoring") {
    logMessage("Monitoring start request via popup");
    debugLog("Starting monitoring", { currentlyRunning: isMonitoringActive });
    startChecking();
    sendResponse({ success: true });
    
  } else if (message.action === "stopMonitoring") {
    logMessage("Monitoring stop request via popup");
    debugLog("Stopping monitoring", { 
      currentlyRunning: isMonitoringActive,
      openTabs: Object.keys(channelTabs).length,
      openWindows: Object.keys(channelWindows).length
    });
    verifyOpenWindows()
      .catch(() => {})
      .then(() => stopChecking())
      .then(() => {
        sendResponse({ success: true });
      });
    return true;
    
  } else if (message.action === "getStatus") {
  debugLog("System status request");
  chrome.storage.local.get(["oAuth"], (result) => {
    if (result.oAuth) {
      oAuth = result.oAuth;
      logMessage("Token loaded from storage for status");
    }
    const status = {
      isRunning: isMonitoringActive,
      channelStatus: channelStatus,
      openTabs: Object.keys(channelTabs).length + Object.keys(channelWindows).length,
      hasToken: !!oAuth
    };
    
    logMessage(`Sending status to popup: monitoring=${status.isRunning}, tabs=${status.openTabs}, token=${status.hasToken}`);
    sendResponse(status);
  });
  return true;
    
  } else if (message.action === "getRewardStats") {
    logMessage("Reward stats request");
    sendResponse({ stats: rewardStats });
    
  } else if (message.action === "clearRewardStats") {
    logMessage("Reward stats clearing");
    rewardStats = {};
    chrome.storage.local.set({ rewardStats }, () => {
      sendResponse({ success: true });
    });
    return true;
    
  } else if (message.action === "rewardClaimed") {
    logMessage(`Reward collection message: channel=${message.channel}, success=${message.success}`);
    updateRewardStats(message.channel, message.success, message.points);
    sendResponse({ success: true });
  
  } else if (message.action === "rewardNotFound") {
  logMessage(`Reward button not found on channel ${message.channel}`);
  sendResponse({ success: true });
    
  } else if (message.action === "minimizeCurrentWindow") {
    logMessage("Minimize current window request");
    debugLog("Minimizing window", { tabId: message.tabId });
    
    if (message.tabId) {
      chrome.tabs.get(message.tabId, (tab) => {
        if (chrome.runtime.lastError) {
          debugLog("Error getting tab information", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        chrome.windows.update(tab.windowId, { state: "minimized" }, () => {
          if (chrome.runtime.lastError) {
            debugLog("Error minimizing window", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            logMessage(`Window minimized (ID: ${tab.windowId})`);
            sendResponse({ success: true });
          }
        });
      });
    } else {
      sendResponse({ success: false, error: "Tab ID not provided" });
    }
    return true;
    
  } else if (message.action === "maximizeCurrentWindow") {
    logMessage("Maximize current window request");
    debugLog("Maximizing window", { tabId: message.tabId });
    
    if (message.tabId) {
      chrome.tabs.get(message.tabId, (tab) => {
        if (chrome.runtime.lastError) {
          debugLog("Error getting tab information", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        chrome.windows.update(tab.windowId, { state: "maximized" }, () => {
          if (chrome.runtime.lastError) {
            debugLog("Error maximizing window", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            logMessage(`Window maximized (ID: ${tab.windowId})`);
            sendResponse({ success: true });
          }
        });
      });
    } else {
      sendResponse({ success: false, error: "Tab ID not provided" });
    }
    return true;
    
  } else if (message.action === "getChannelData") {
    console.log("Received getChannelData request");
    
    loadSettings().then(() => {
      console.log("Current channels after load:", channels);
      
      chrome.storage.local.get(["lastLiveStreams", "channelStatus", "rewardStats"], (result) => {
        const lastLiveStreams = result.lastLiveStreams || [];
        const channelStatus = result.channelStatus || {};
        const rewardStats = result.rewardStats || {};
        
        const responseData = {
          success: true, 
          data: {
            channels: channels,
            liveStreams: lastLiveStreams,
            channelStatus: channelStatus,
            rewardStats: rewardStats,
            showOverlay: showOverlay
          }
        };
        
        console.log("Sending channel data:", responseData);
        sendResponse(responseData);
      });
    });
    return true;

  } else if (message.action === "configUpdated") {
    if (message.config) {
      if (message.config.clientId) clientId = message.config.clientId;
      if (message.config.userId) userId = message.config.userId;
      if (message.config.redirectUri) redirectUri = message.config.redirectUri;
      
      authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=user:read:follows`;
      
      logMessage("API configuration updated");
    }
    
    logMessage("Configuration updated, reloading settings...");
    
    loadSettings().then(() => {
      console.log("Settings reloaded after configuration update");
      console.log("New showOverlay value:", showOverlay);
      
      chrome.tabs.query({ url: "*://www.twitch.tv/*" }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: "updateChannelOverlay",
            channels: channels,
            liveStreams: [],
            channelStatus: channelStatus,
            showOverlay: showOverlay
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log(`Error sending update to tab ${tab.id}:`, chrome.runtime.lastError.message);
            } else {
              console.log(`Update sent to tab ${tab.id}`);
            }
          });
        });
      });
      
      sendResponse({ success: true });
    }).catch((error) => {
      logMessage(`Settings reload error: ${error.message}`, "error");
      sendResponse({ success: false, error: error.message });
    });
    return true;
    
  } else if (message.action === "forceUpdateOverlay") {
    logMessage("Force overlay update");
    showOverlay = message.showOverlay;
    
    console.log("Forcing showOverlay:", showOverlay);
    
    chrome.tabs.query({ url: "*://www.twitch.tv/*" }, (tabs) => {
      console.log(`Sending forced update to ${tabs.length} tabs`);
      
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: "updateChannelOverlay",
          channels: channels,
          liveStreams: [],
          channelStatus: channelStatus,
          showOverlay: showOverlay
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log(`Error forcing update to tab ${tab.id}:`, chrome.runtime.lastError.message);
          } else {
            console.log(`Forced update sent to tab ${tab.id}:`, response);
          }
        });
      });
      
      sendResponse({ success: true });
    });
    return true;
    
  } else if (message.action === "getInitialOverlay") {
  logMessage("Initial data request for overlay");
  
  chrome.storage.local.get(["lastOverlayData"], result => {
    const response = result.lastOverlayData || { 
      action: "updateChannelOverlay",
      channels: [],
      liveStreams: [],
      channelStatus: {},
      showOverlay: false 
    };
    
    sendResponse(response);
    
    if (!result.lastOverlayData && showOverlay) {
      setTimeout(() => getFollowedList(), 1000);
    }
  });
  
  return true;
} else {
    logMessage(`Unknown action: ${message.action}`, "warning");
    sendResponse({ success: false, error: "Unknown action" });
  }
  
  return true;
});

function logMessage(message, level = "info") {
  const logEntry = {
    timestamp: new Date().toLocaleString(navigator.language, {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }),
    level,
    message
  };
  
  chrome.storage.local.get(["logs"], (result) => {
    const logs = result.logs || [];
    logs.push(logEntry);
    
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    chrome.storage.local.set({ logs }, () => {
      chrome.tabs.query({ url: chrome.runtime.getURL("logs.html") }, (tabs) => {
        if (tabs.length > 0) {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: "log", log: logEntry }, (response) => {
              if (chrome.runtime.lastError) {
                console.log("Log not sent to tab:", tab.id, chrome.runtime.lastError.message);
              }
            });
          });
        }
      });
    });
  });
}

function refreshUserToken() {
  return new Promise((resolve, reject) => {
    logMessage("Starting token refresh process...");
    
    if (!chrome.identity) {
      logMessage("chrome.identity not available.", "error");
      reject(new Error("chrome.identity is not available"));
      return;
    }

    logMessage(`Starting WebAuthFlow with URL: ${authUrl}`);
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true,
      },
      (redirectUrl) => {
        if (chrome.runtime.lastError) {
          logMessage(`WebAuthFlow error: ${JSON.stringify(chrome.runtime.lastError)}`, "error");
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (!redirectUrl) {
          logMessage("Redirect URL not received from Twitch", "error");
          reject(new Error("No redirect URL"));
          return;
        }
        
        logMessage(`Received redirect URL: ${redirectUrl}`);
        
        try {
          const url = new URL(redirectUrl);
          const fragment = url.hash.substring(1);
          const params = new URLSearchParams(fragment);
          const token = params.get('access_token');
          
          if (!token) {
            logMessage("Token not found in URL", "error");
            reject(new Error("Token not found in URL"));
            return;
          }
          
          oAuth = token;
          logMessage(`Token successfully extracted: ${token.substring(0, 10)}...`);
          
          chrome.storage.local.set({ oAuth }, () => {
            if (chrome.runtime.lastError) {
              logMessage(`Token saving error: ${chrome.runtime.lastError}`, "error");
            } else {
              logMessage("Token successfully saved in storage");
            }
          });
          
          resolve(oAuth);
        } catch (error) {
          logMessage(`URL parsing error: ${error.message}`, "error");
          reject(error);
        }
      }
    );
  });
}

async function verifyOpenWindows() {
  try {
    const allWindows = await new Promise(resolve => 
      chrome.windows.getAll({}, resolve)
    );
    
    const windowsToRemove = [];
    
    for (const [channel, windowId] of Object.entries(channelWindows)) {
      if (!allWindows.some(w => w.id === windowId)) {
        logMessage(`Discrepancy found: window ${channel} (ID: ${windowId}) already closed`, "warning");
        windowsToRemove.push(channel);
      }
    }
    
    windowsToRemove.forEach(channel => {
      delete channelWindows[channel];
    });
    
    if (windowsToRemove.length > 0) {
      logMessage(`Cleared ${windowsToRemove.length} outdated window records`);
    }
    
    return true;
  } catch (error) {
    logMessage(`Windows verification error: ${error.message}`, "error");
    return false;
  }
}

async function getFollowedList() {
  logMessage("Starting channel status check...");
  debugLog("Calling getFollowedList function");
  
  let retryCount = 0;
  const maxRetries = 5;
  
  while (retryCount < maxRetries) {
    try {
      await loadSettings();
      debugLog("Settings reloaded", { channels: channels.length, delay, windowSettings });
      
      if (!channels || !channels.length) {
        logMessage("Channels list empty", "warning");
        return;
      }
      
      logMessage(`Checking channels: ${channels.join(", ")}`);

      if (!oAuth) {
        debugLog("Token missing in memory, loading from storage");
        const tokenResult = await new Promise((resolve) => {
          chrome.storage.local.get(["oAuth"], resolve);
        });
        
        if (tokenResult.oAuth) {
          oAuth = tokenResult.oAuth;
          logMessage("Token successfully loaded from storage");
          debugLog("Token loaded", { tokenLength: oAuth.length, tokenStart: oAuth.substring(0, 10) });
        } else {
          logMessage("Token not found in storage, authorization required", "error");
          try {
            await refreshUserToken();
            logMessage("Token successfully refreshed");
            continue;
          } catch (tokenError) {
            logMessage(`Failed to refresh token: ${tokenError.message}`, "error");
            await new Promise(resolve => setTimeout(resolve, 30000));
            continue;
          }
        }
      }

      const headers = {
        "Authorization": `Bearer ${oAuth}`,
        "Client-ID": clientId,
      };
      
      debugLog("API request headers", { clientId, tokenStart: oAuth.substring(0, 10) });

      const validateResponse = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: { "Authorization": `Bearer ${oAuth}` }
      });
      
      if (!validateResponse.ok) {
        logMessage(`Token invalid (${validateResponse.status})`, "error");
        oAuth = "";
        chrome.storage.local.remove("oAuth");
        try {
          await refreshUserToken();
          logMessage("Token successfully refreshed");
          continue;
        } catch (tokenError) {
          logMessage(`Failed to refresh token: ${tokenError.message}`, "error");
          await new Promise(resolve => setTimeout(resolve, 30000));
          continue;
        }
      }

      const validateData = await validateResponse.json();
      debugLog("Token validation data", validateData);

      const channelNames = channels.map(c => c.toLowerCase());
      const streamParams = new URLSearchParams();
      channelNames.forEach(name => streamParams.append('user_login', name));
      
      const apiUrl = `https://api.twitch.tv/helix/streams?${streamParams.toString()}`;
      debugLog("API streams request", { url: apiUrl, channels: channelNames });
      
      const response = await fetch(apiUrl, { headers });
      
      if (!response.ok) {
        const errorText = await response.text();
        debugLog("API streams error", { status: response.status, errorText });
        
        if (response.status === 401) {
          logMessage("Authorization error (401)", "error");
          oAuth = "";
          chrome.storage.local.remove("oAuth");
          try {
            await refreshUserToken();
            logMessage("Token successfully refreshed");
            continue;
          } catch (tokenError) {
            logMessage(`Failed to refresh token: ${tokenError.message}`, "error");
            await new Promise(resolve => setTimeout(resolve, 30000));
            continue;
          }
        }
        throw new Error(`HTTP error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      logMessage(`Received data on ${data.data.length} active streams`);
      debugLog("Active streams data", data);

      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ lastLiveStreams: data.data }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      const channelsToOpen = [];
      const channelsToClose = [];
      
      for (const channel of channels) {
        const channelLower = channel.toLowerCase();
        const streamData = data.data.find(
          (stream) => stream.user_login.toLowerCase() === channelLower
        );
        
        const currentStatus = streamData ? "live" : "offline";
        const previousStatus = channelStatus[channel] || "offline";
        
        debugLog(`Channel ${channel} status`, { 
          previous: previousStatus, 
          current: currentStatus,
          isFirstCheck,
          streamData: streamData ? {
            title: streamData.title,
            game_name: streamData.game_name,
            viewer_count: streamData.viewer_count
          } : null
        });

        channelStatus[channel] = currentStatus;
        logMessage(`Channel ${channel}: ${previousStatus} -> ${currentStatus}`);
        const shouldOpenChannel = currentStatus === "live" && (
        previousStatus === "offline" ||
        (isFirstCheck && currentStatus === "live" && 
        !channelTabs[channel] && !channelWindows[channel])
      );
        
        const shouldCloseChannel = previousStatus === "live" && currentStatus === "offline";
        
        if (shouldOpenChannel) {
          if (isFirstCheck && !Object.hasOwnProperty.call(channelStatus, channel)) {
            logMessage(`${channel} online at startup (new/stale status)! Opening ${windowSettings.separateWindow ? 'window' : 'tab'}...`);
          }
          channelsToOpen.push({ channel, streamData });
        }
        
        if (shouldCloseChannel) {
          channelsToClose.push(channel);
        }
      }

      for (const channel of channels) {
        const streamData = data.data.find(
            (stream) => stream.user_login.toLowerCase() === channel.toLowerCase()
        );

        if (streamData) {
            await getChannelSubscribtion(streamData.user_id);
        }
      }
      
      for (const channel of channelsToClose) {
        logMessage(`${channel} became offline. Closing ${windowSettings.separateWindow ? 'window' : 'tab'}...`);
        await closeChannelTab(channel);
      }
      
      for (const { channel, streamData } of channelsToOpen) {
        await openChannelTab(channel, streamData);
      }
      
      const now = Date.now();
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ 
          channelStatus,
          lastStatusUpdate: now 
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      
      await updateChannelOverlay(data.data);
      
      if (isFirstCheck) {
        isFirstCheck = false;
        logMessage("First check completed, switching to normal mode");
      }
      
      logMessage("Channel status check completed");
      debugLog("Final state", { 
        channelStatus, 
        openTabs: Object.keys(channelTabs).length,
        openWindows: Object.keys(channelWindows).length,
        channelsOpened: channelsToOpen.length,
        channelsClosed: channelsToClose.length
      });
      
      break;
      
    } catch (error) {
      retryCount++;
      logMessage(`Error checking channel status (attempt ${retryCount}/${maxRetries}): ${error.message}`, "error");
      
      if (retryCount >= maxRetries) {
        logMessage("Maximum retry attempts reached, but monitoring continues", "warning");
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000 * retryCount));
        }
    }
}

async function getChannelSubscribtion(channelId) {
    if (!channelId) {
        logMessage("Cannot get subscription status without channel ID", "error");
        return;
    }

    const headers = {
        "Authorization": `Bearer ${oAuth}`,
        "Client-ID": clientId,
    };

    const apiUrl = `https://api.twitch.tv/helix/subscriptions/user?broadcaster_id=${channelId}&user_id=${userId}`;
    debugLog("API subscription request", { url: apiUrl });

    try {
        const response = await fetch(apiUrl, { headers });

        if (response.status === 200) {
            const subData = await response.json();
            const tier = subData.data[0].tier;
            let multiplier = 1.0;
            if (tier === "1000") multiplier = 1.2;
            if (tier === "2000") multiplier = 1.5;
            if (tier === "3000") multiplier = 2.0;

            logMessage(`User is subscribed to channel ${channelId}. Tier: ${tier}, Multiplier: ${multiplier}`);
            // Save the multiplier
            if (!rewardStats[channelId]) rewardStats[channelId] = {};
            rewardStats[channelId].subMultiplier = multiplier;
            chrome.storage.local.set({ rewardStats });

        } else if (response.status === 404) {
            logMessage(`User is not subscribed to channel ${channelId}.`);
            if (!rewardStats[channelId]) rewardStats[channelId] = {};
            rewardStats[channelId].subMultiplier = 1.0;
            chrome.storage.local.set({ rewardStats });
        } else {
            const errorText = await response.text();
            logMessage(`Error checking subscription for channel ${channelId}: ${response.status} - ${errorText}`, "error");
        }
    } catch (error) {
        logMessage(`Error fetching subscription for channel ${channelId}: ${error.message}`, "error");
    }
}

async function openChannelTab(channel, streamData) {
  try {
    if (windowSettings.separateWindow) {
      const windowOptions = {
        url: `https://www.twitch.tv/${channel}`,
        type: "normal",
        width: 1200,
        height: 800,
        focused: !windowSettings.minimize
      };
      
      debugLog(`Creating window for ${channel}`, windowOptions);
      
      const window = await new Promise((resolve, reject) => {
        chrome.windows.create(windowOptions, (window) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(window);
          }
        });
      });
      
      channelWindows[channel] = window.id;
      logMessage(`Window for ${channel} opened (ID: ${window.id})`);
      
      if (windowSettings.minimize) {
        chrome.windows.update(window.id, { state: "minimized" });
      }
      
      if (windowSettings.mute) {
        chrome.tabs.query({ windowId: window.id }, (tabs) => {
          if (tabs[0]) chrome.tabs.update(tabs[0].id, { muted: true });
        });
      }

    } else {
      debugLog(`Creating tab for ${channel}`);
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.create(
          { url: `https://www.twitch.tv/${channel}`,
            active: !windowSettings.minimize },
          (tab) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(tab);
            }
          }
        );
      });
      
      channelTabs[channel] = tab.id;
      logMessage(`Tab for ${channel} opened (ID: ${tab.id})`);

      if (windowSettings.mute) {
        chrome.tabs.update(tab.id, { muted: true });
      }
    }
    
    if (streamData) {
      logMessage(`Stream ${channel}: "${streamData.title}" | ${streamData.game_name} | Viewers: ${streamData.viewer_count}`);
    }
    
  } catch (error) {
    logMessage(`Error opening for ${channel}: ${error.message}`, "error");
  }
}


async function closeChannelTab(channel) {
  if (windowSettings.separateWindow && channelWindows[channel]) {
    try {
      await new Promise((resolve, reject) => {
        chrome.windows.get(channelWindows[channel], (window) => {
          if (chrome.runtime.lastError) {
            logMessage(`Window for ${channel} already closed`);
            resolve();
          } else {
            chrome.windows.remove(channelWindows[channel], () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          }
        });
      });
      
      logMessage(`Window for ${channel} closed`);
      delete channelWindows[channel];
      
    } catch (error) {
      logMessage(`Error closing window for ${channel}: ${error.message}`, "error");
      delete channelWindows[channel];
    }
  } else if (!windowSettings.separateWindow && channelTabs[channel]) {
    try {
      await new Promise((resolve, reject) => {
        chrome.tabs.get(channelTabs[channel], (tab) => {
          if (chrome.runtime.lastError) {
            logMessage(`Tab for ${channel} already closed`);
            resolve();
          } else {
            chrome.tabs.remove(channelTabs[channel], () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          }
        });
      });
      
      logMessage(`Tab for ${channel} closed`);
      delete channelTabs[channel];
      
    } catch (error) {
      logMessage(`Error closing tab for ${channel}: ${error.message}`, "error");
      delete channelTabs[channel];
    }
  }
}

async function updateChannelOverlay(liveStreams) {
  if (overlayUpdateInProgress) {
    logMessage("Overlay update already in progress, skipping...", "warning");
    return;
  }
  
  try {
    overlayUpdateInProgress = true;
    logMessage("Starting overlay update...");
    
    await loadSettings();
    
    debugLog("Current data", { 
      channels: channels.length,
      channelStatus,
      rewardStats
    });
    
    const tabs = await getTwitchTabs();
    logMessage(`Found ${tabs.length} Twitch tabs for update`);
    
    const updateData = {
      channels: channels,
      liveStreams: liveStreams,
      channelStatus: channelStatus,
      rewardStats: rewardStats,
      showOverlay: showOverlay
    };
    
    debugLog("Update data", updateData);
    
    const updatePromises = tabs.map(async tab => {
      try {
        await sendMessageWithRetry(tab.id, {
          action: "updateChannelOverlay",
          ...updateData
        });
      } catch (error) {
        logMessage(`Error updating tab ${tab.id}: ${error.message}`, "error");
      }
    });

    await Promise.all(updatePromises);
    
    const statsUpdate = {
      stats: rewardStats,
      ...updateData
    };
    
    debugLog("Saving stats update", statsUpdate);
    
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({
        channels: channels,
        channelStatus: channelStatus,
        rewardStats: rewardStats,
        lastStatsUpdate: statsUpdate,
        lastLiveStreams: liveStreams
      }, () => {
        if (chrome.runtime.lastError) {
          logMessage(`Data saving error: ${chrome.runtime.lastError.message}`, "error");
          reject(chrome.runtime.lastError);
        } else {
          logMessage("All data successfully saved");
          resolve();
        }
      });
    });
    
    logMessage("Overlay update completed");
  } catch (error) {
    logMessage(`Overlay update error: ${error.message}`, "error");
  } finally {
    overlayUpdateInProgress = false;
  }
}

async function forceUpdateStats() {
  console.log("Forcing stats update...");
  console.log("Current channels:", channels);
  
  const statsUpdate = {
    stats: rewardStats,
    channels: channels,
    channelStatus: channelStatus,
    liveStreams: [],
    showOverlay: showOverlay
  };
  
  try {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({
        channels: channels,
        channelStatus: channelStatus,
        rewardStats: rewardStats,
        lastStatsUpdate: statsUpdate
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving stats:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log("Stats data saved successfully");
          resolve();
        }
      });
    });
  } catch (error) {
    console.error("Error in forceUpdateStats:", error);
  }
}

async function executeScriptIfNeeded(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: {tabId},
      files: ['content.js']
    });
  } catch (e) {
  }
}

async function sendMessageWithRetry(tabId, data, attempt = 0) {
  try {
    const tab = await new Promise((resolve, reject) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tab);
        }
      });
    });

    if (tab.status !== 'complete') {
      throw new Error('Tab not ready');
    }

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, data, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    if (attempt < 3) {
      logMessage(`Retry attempt ${attempt + 1} for tab ${tabId}`, "warning");
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      return sendMessageWithRetry(tabId, data, attempt + 1);
    }
    logMessage(`Failed to send message to tab ${tabId} after ${attempt} attempts`, "error");
    return null;
  }
}

async function getTwitchTabs() {
  return new Promise(resolve => {
    chrome.tabs.query({url: "*://www.twitch.tv/*"}, tabs => {
      resolve(tabs || []);
    });
  });
}

async function startChecking() {
  if (isMonitoringActive) {
    logMessage("Monitoring already active", "warning");
    return;
  }

  logMessage("Starting channel monitoring...");
  isMonitoringActive = true;
  isFirstCheck = true;
  
  chrome.storage.local.set({ monitoringActive: true });

  if (!serviceWorkerReady()) { 
    setTimeout(startChecking, 1000);
    return;
  }

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  
  verificationIntervals.forEach(interval => clearInterval(interval));
  verificationIntervals = [];

  await loadSettings();
  
  startKeepAlive();

  startMonitoringInterval();
  
  logMessage("Performing initial check...");
  try {
    await getFollowedList();
  } catch (error) {
    logMessage(`Initial check error: ${error.message}`, "error");
  }

  const verificationInterval = setInterval(async () => {
    if (isMonitoringActive) {
      try {
        await verifyOpenWindows();
      } catch (error) {
        logMessage(`Windows verification error: ${error.message}`, "error");
      }
    }
  }, 300000);
  
  verificationIntervals.push(verificationInterval);
  
  logMessage("Monitoring successfully started");
chrome.runtime.sendMessage({
  action: "statusChanged",
  isRunning: true
}).catch(() => {
});
}

function serviceWorkerReady() {
  try {
    const requiredApis = [
      'tabs',
      'storage',
      'windows',
      'runtime',
      'identity'
    ];
    
    const missingApis = requiredApis.filter(api => !chrome[api]);
    
    if (missingApis.length > 0) {
      logMessage(`Missing required APIs: ${missingApis.join(', ')}`, "error");
      return false;
    }
    
    try {
      chrome.storage.local.get(['test'], () => {
        if (chrome.runtime.lastError) {
          logMessage("Storage not available", "error");
          return false;
        }
      });
    } catch (error) {
      logMessage(`Storage check error: ${error.message}`, "error");
      return false;
    }
    
    try {
      chrome.tabs.query({}, () => {
        if (chrome.runtime.lastError) {
          logMessage("Tabs API not available", "error");
          return false;
        }
      });
    } catch (error) {
      logMessage(`Tabs API check error: ${error.message}`, "error");
      return false;
    }
    
    return true;
  } catch (error) {
    logMessage(`Service worker readiness check error: ${error.message}`, "error");
    return false;
  }
}

async function stopChecking() {
  if (!isMonitoringActive) {
    logMessage("Monitoring already stopped", "warning");
    return;
  }

  logMessage("Stopping monitoring...");
  isMonitoringActive = false;
  isFirstCheck = true;
  
  chrome.storage.local.set({ monitoringActive: false });
  
  try {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    
    verificationIntervals.forEach(interval => clearInterval(interval));
    verificationIntervals = [];
    
    stopKeepAlive();
    
    await verifyOpenWindows();
    
    const closePromises = [
      ...Object.entries(channelWindows).map(([channel, windowId]) => 
        closeWindowSafe(windowId, channel)
      ),
      ...Object.entries(channelTabs).map(([channel, tabId]) => 
        closeTabSafe(tabId, channel)
      )
    ];
    
    await Promise.all(closePromises);

    const now = Date.now();
    await new Promise((resolve) => {
      chrome.storage.local.set({ 
        channelStatus,
        lastStatusUpdate: now 
      }, resolve);
    });
    
    logMessage("Monitoring stopped completely");
  } catch (error) {
    logMessage(`Error stopping monitoring: ${error.message}`, "error");
  } finally {
    channelWindows = {};
    channelTabs = {};
  }
  chrome.runtime.sendMessage({
  action: "statusChanged",
  isRunning: false
}).catch(() => {
});
}

async function closeWindowSafe(windowId, channel) {
  try {
    await new Promise(resolve => chrome.windows.remove(windowId, resolve));
    logMessage(`Window ${channel} closed successfully`);
  } catch (error) {
    logMessage(`Error closing window ${channel}: ${error.message}`, "warning");
  }
}

async function closeTabSafe(tabId, channel) {
  try {
    await new Promise(resolve => chrome.tabs.remove(tabId, resolve));
    logMessage(`Tab for ${channel} closed successfully`);
  } catch (error) {
    logMessage(`Error closing tab for ${channel}: ${error.message}`, "warning");
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [channel, id] of Object.entries(channelTabs)) {
    if (id === tabId) {
      logMessage(`Channel ${channel} tab closed by user`);
      delete channelTabs[channel];
      break;
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  logMessage(`Command executed: ${command}`);
  
  if (command === "open_logs") {
    chrome.windows.create({
      url: "logs.html",
      type: "popup",
      width: 800,
      height: 600
    });
  } else if (command === "open_config") {
    chrome.windows.create({
      url: "config.html",
      type: "popup",
      width: 600,
      height: 500
    });
  }
});

chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local') {
    if (changes.delay) {
      logMessage(`Interval check changed: ${changes.delay.oldValue} -> ${changes.delay.newValue} sec`);
      if (isMonitoringActive) {
        delay = changes.delay.newValue;
        startMonitoringInterval();
      }
    }
    
    if (changes.channels) {
      logMessage(`Channels list changed`);
      await loadSettings();
    }
  }
});

chrome.runtime.onSuspend.addListener(async () => {
  logMessage("Browser is closing, stopping monitoring...");
  
  isMonitoringActive = false;
  chrome.storage.local.set({ monitoringActive: false });
  
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  
  verificationIntervals.forEach(interval => clearInterval(interval));
  verificationIntervals = [];
  
  stopKeepAlive();
  
  logMessage("Monitoring stopped when browser closed");
});