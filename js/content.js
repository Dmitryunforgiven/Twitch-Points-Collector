let channelOverlay = null;
let overlayData = {
  channels: [],
  liveStreams: [],
  channelStatus: {},
  showOverlay: true
};

let rewardCheckInterval = null;
let isInitialized = false;

console.log("[Content Script] Initialization on page:", window.location.href);

function loadOverlaySettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['showOverlay'], (result) => {
      overlayData.showOverlay = result.showOverlay !== false;
      console.log("Overlay settings loaded from storage:", result);
      resolve();
    });
  });
}

function refreshOverlayData() {
  if (!isContextValid()) return;
  
  console.log("Requsting an update of channels' statuses...");
  chrome.runtime.sendMessage({ action: "getChannelData" }, (response) => {
    console.log("Status request response:", response);
    if (response && response.success) {
      overlayData = {
        ...overlayData,
        ...response.data
      };
      console.log("Statuses updated:", overlayData);
      updateOverlayContent();
    } else {
      console.error("Error receiving statuses:", response);
    }
  });
}

function isContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (error) {
    return false;
  }
}

function createChannelOverlay() {
  console.log("createChannelOverlay called, showOverlay =", overlayData.showOverlay);
  
  if (channelOverlay) {
    console.log("[Content Script] Overlay already exists, skipping creation");
    return;
  }

  if (!overlayData.showOverlay) {
    console.log("[Content Script] Overlay is disabled, skipping creation");
    return;
  }

  console.log("[Content Script] Creting channel overlay");
  
  channelOverlay = document.createElement('div');
  channelOverlay.id = 'twitch-channel-overlay';
  channelOverlay.innerHTML = `
    <div class="overlay-header">
      <span>Channels 📺</span>
      <button class="overlay-toggle">−</button>
    </div>
    <div class="overlay-content" id="overlay-content">
      <div class="loading">Loading...</div>
    </div>
  `;
  
  const style = document.createElement('style');
    style.textContent = `
    #twitch-channel-overlay {
      position: fixed !important;
      top: 80px !important;
      right: 20px !important;
      width: 320px !important;
      max-height: 500px !important;
      background: rgba(0, 0, 0, 0.95) !important;
      border: 2px solid #6441a5 !important;
      border-radius: 12px !important;
      color: white !important;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
      font-size: 13px !important;
      z-index: 999999 !important;
      overflow: hidden !important;
      transition: all 0.3s ease !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8) !important;
      backdrop-filter: blur(10px) !important;
      user-select: none !important;
    }
    
    #twitch-channel-overlay .overlay-header {
      background: linear-gradient(135deg, #6441a5, #9147ff) !important;
      padding: 12px 16px !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      font-weight: bold !important;
      cursor: move !important;
      font-size: 14px !important;
      border-radius: 10px 10px 0 0 !important;
      user-select: none !important;
    }
    
    #twitch-channel-overlay .overlay-toggle {
      background: rgba(255, 255, 255, 0.2) !important;
      border: none !important;
      color: white !important;
      font-size: 18px !important;
      cursor: pointer !important;
      padding: 4px 8px !important;
      border-radius: 4px !important;
    }
    
    #twitch-channel-overlay .overlay-content {
      max-height: 450px !important;
      overflow-y: auto !important;
      padding: 12px !important;
    }
    
    #twitch-channel-overlay .overlay-content.collapsed {
      display: none !important;
    }
    
    #twitch-channel-overlay .channel-item {
      display: flex !important;
      align-items: center !important;
      padding: 10px 12px !important;
      margin-bottom: 8px !important;
      background: rgba(255, 255, 255, 0.1) !important;
      border-radius: 8px !important;
      border-left: 4px solid #666 !important;
      cursor: pointer !important;
    }
    
    #twitch-channel-overlay .channel-item.live {
      border-left-color: #00ff88 !important;
      background: rgba(0, 255, 136, 0.15) !important;
    }
    
    #twitch-channel-overlay .channel-item.offline {
      border-left-color: #ff4757 !important;
      opacity: 0.7 !important;
    }
    
    #twitch-channel-overlay .channel-status {
      width: 12px !important;
      height: 12px !important;
      border-radius: 50% !important;
      margin-right: 12px !important;
    }
    
    #twitch-channel-overlay .status-live { 
      background: #00ff88 !important;
    }
    
    #twitch-channel-overlay .status-offline { 
      background: #ff4757 !important;
    }
    
    #twitch-channel-overlay .channel-info {
      flex: 1 !important;
    }
    
    #twitch-channel-overlay .channel-name {
      font-weight: bold !important;
      margin-bottom: 4px !important;
    }

    #twitch-channel-overlay .stream-title {
      font-size: 12px !important;
      color: #e1e1e1 !important;
      margin-bottom: 4px !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      line-height: 1.3 !important;

    #twitch-channel-overlay .stream-meta {
      font-size: 11px !important;
      color: #b3b3b3 !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    }
    #twitch-channel-overlay .game-name {
      color: #9147ff !important;
      font-weight: 500 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      flex: 1 !important;
      margin-right: 8px !important;
    }

    #twitch-channel-overlay .viewer-count {
      color: #ff6b6b !important;
      font-weight: bold !important;
      flex-shrink: 0 !important;
    }

    #twitch-channel-overlay .last-update {
      text-align: center !important;
      font-size: 10px !important;
      color: #666 !important;
      padding: 8px !important;
      border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
      margin-top: 8px !important;
    }
      
    }
    #twitch-channel-overlay .loading {
      text-align: center !important;
      padding: 20px !important;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(channelOverlay);
  
  setupOverlayEvents();
  setupDragging();
  restorePosition();
  
  console.log('[Content Script] Overlay created');
}

function setupOverlayEvents() {
  const toggleBtn = channelOverlay.querySelector('.overlay-toggle');
  const content = channelOverlay.querySelector('.overlay-content');
  
  if (toggleBtn && content) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      content.classList.toggle('collapsed');
      toggleBtn.textContent = content.classList.contains('collapsed') ? '+' : '−';
    });
  }
}

function setupDragging() {
  let isDragging = false;
  let startX = 0, startY = 0, initialX = 0, initialY = 0;
  
  const header = channelOverlay.querySelector('.overlay-header');
  const toggleBtn = channelOverlay.querySelector('.overlay-toggle');
  
  if (!header) return;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target === toggleBtn) return;
    
    isDragging = true;
    const rect = channelOverlay.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initialX = rect.left;
    initialY = rect.top;
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !channelOverlay) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    let newX = initialX + deltaX;
    let newY = initialY + deltaY;
    
    newX = Math.max(0, Math.min(newX, window.innerWidth - 320));
    newY = Math.max(0, Math.min(newY, window.innerHeight - 100));
    
    channelOverlay.style.left = newX + 'px';
    channelOverlay.style.top = newY + 'px';
    channelOverlay.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      savePosition();
    }
  });
}

function savePosition() {
  if (!channelOverlay) return;
  
  try {
    const rect = channelOverlay.getBoundingClientRect();
    const position = { x: rect.left, y: rect.top };
    localStorage.setItem('twitchOverlayPosition', JSON.stringify(position));
  } catch (error) {
    console.log('[Content Script] Error saving position:', error);
  }
}

function restorePosition() {
  if (!channelOverlay) return;
  
  try {
    const savedPosition = localStorage.getItem('twitchOverlayPosition');
    if (savedPosition) {
      const position = JSON.parse(savedPosition);
      const maxX = window.innerWidth - 320;
      const maxY = window.innerHeight - 100;
      
      if (position.x >= 0 && position.x <= maxX && position.y >= 0 && position.y <= maxY) {
        channelOverlay.style.left = position.x + 'px';
        channelOverlay.style.top = position.y + 'px';
        channelOverlay.style.right = 'auto';
      }
    }
  } catch (error) {
    console.log('[Content Script] Error restoring position:', error);
  }
}

function updateOverlayContent() {
  console.log("=== updateOverlayContent ===");
  console.log("overlayData.showOverlay:", overlayData.showOverlay);
  console.log("overlayData:", overlayData);
  
  if (!overlayData.showOverlay) {
    console.log("Overlay is disabled, removing channel overlay");
    removeChannelOverlay();
    return;
  }
  
  console.log("Overlay is enabled, checking for existing channel overlay");

  if (!channelOverlay && overlayData.showOverlay) {
    console.log("Overlay not found, creating a new one");
    createChannelOverlay();
    if (!channelOverlay) {
      console.log("Overlay creation disabled by settings");
      return;
    }
  }
  
  const content = document.getElementById('overlay-content');
  if (!content) {
    console.log("overlay-content element not found");
    return;
  }
  
  console.log("[Content Script] Updating overlay content");
  console.log("Channel:", overlayData.channels);
  console.log("Channel status:", overlayData.channelStatus);
  console.log("Stream content:", overlayData.liveStreams);
  
  if (overlayData.channels.length === 0) {
    content.innerHTML = `
      <div class="loading">
        Channels are not set up<br>
        <small>Open extension's settings</small>
      </div>
    `;
    return;
  }
  
  const channelsHtml = overlayData.channels.map(channel => {
    const isLive = overlayData.channelStatus[channel] === 'live';
    const streamData = overlayData.liveStreams.find(
      stream => stream.user_login && stream.user_login.toLowerCase() === channel.toLowerCase()
    );
    
    console.log(`Handling channel ${channel}:`, {
      isLive,
      status: overlayData.channelStatus[channel],
      hasStreamData: !!streamData,
      streamData: streamData ? {
        user_login: streamData.user_login,
        title: streamData.title,
        game_name: streamData.game_name,
        viewer_count: streamData.viewer_count
      } : null
    });
    
    let streamInfo = '';
    if (isLive && streamData) {
      const title = streamData.title && streamData.title.length > 35 
        ? streamData.title.substring(0, 35) + '...' 
        : streamData.title || 'No title';
      
      streamInfo = `
        <div class="stream-title">${title}</div>
        <div class="stream-meta">
          <span class="game-name">${streamData.game_name || 'No category'}</span>
          <span class="viewer-count">${formatViewerCount(streamData.viewer_count)} 👁</span>
        </div>
      `;
    } else {
      streamInfo = `
        <div class="stream-title"></div>
        <div class="stream-meta">
          <span style="color: #666;">Offline</span>
        </div>
      `;
    }
    
    return `
      <div class="channel-item ${isLive ? 'live' : 'offline'}" data-channel="${channel}">
        <div class="channel-status ${isLive ? 'status-live' : 'status-offline'}"></div>
        <div class="channel-info">
          <div class="channel-name">${channel}</div>
          ${streamInfo}
        </div>
      </div>
    `;
  }).join('');
  
  const lastUpdate = new Date().toLocaleTimeString(navigator.language, {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  content.innerHTML = channelsHtml + `<div class="last-update">Updated: ${lastUpdate}</div>`;

  content.querySelectorAll('.channel-item').forEach(item => {
    item.addEventListener('click', () => {
      const channel = item.dataset.channel;
      if (channel) {
        console.log(`[Content Script] Transition to channel: ${channel}`);
        window.open(`https://www.twitch.tv/${channel}`, '_blank');
      }
    });
  });
}

function formatViewerCount(count) {
  if (!count) return '0';
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
}

function removeChannelOverlay() {
  if (channelOverlay) {
    try {
      console.log("[Content Script] Removing channel overlay");
      channelOverlay.remove();
      channelOverlay = null;
      console.log('[Content Script] Overlay removed');
    } catch (error) {
      console.log('[Content Script] Overlay remove error:', error);
    }
  } else {
    console.log("[Content Script] Overlay already exists");
  }
}

function extractChannelName() {
  const url = window.location.pathname;
  const match = url.match(/^\/([^\/]+)/);
  return match ? match[1] : null;
}

function checkAndClaimRewards() {
  if (!isContextValid()) return;
  
  console.log("[Content Script] Starting reward check...");
  

  const currentChannel = extractChannelName();
  console.log("Current channel:", currentChannel)

  if (!currentChannel) {
    console.log("Could not extract channel name from URL, skipping reward check");
    return;
  }

  const rewardButton = findRewardButton();
  if (rewardButton) {
    console.log("[Content Script] Reward Button found via exact search");
    
    const buttonText = rewardButton.textContent || rewardButton.getAttribute('aria-label') || '';
    console.log(`[Content Script] Button Text/Label: "${buttonText}"`);
    
    rewardButton.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      try {
        const rect = rewardButton.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        const mouseEvents = ['mousedown', 'mouseup', 'click'];
        mouseEvents.forEach(eventType => {
          const event = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 0
          });
          rewardButton.dispatchEvent(event);
        });
        
        rewardButton.click();
        console.log("[Content Script] Click performed on reward button");
        
        if (isContextValid()) {
          console.log("Sending reward claimed message");
          chrome.runtime.sendMessage({
            action: "rewardClaimed",
            channel: currentChannel,
            success: true,
            points: 50,
            timestamp: new Date().toISOString(),
            method: "exact_search"
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log("Stats sending error:", chrome.runtime.lastError.message);
            } else {
              console.log("Stats sent:", response);
            }
          });
        }

        setTimeout(() => {
          const newButton = findRewardButton();
          const success = !newButton;
          
          console.log(`[Content Script] Claim result: ${success ? 'success' : 'failure'}`);
          
          if (isContextValid()) {
            chrome.runtime.sendMessage({
              action: "rewardClaimed",
              channel: extractChannelName(),
              success: success,
              points: 50,
              timestamp: new Date().toISOString(),
              method: "exact_search_corrected",
              error: "Button still present after click"
            });
          }
        }, 3000);
        
      } catch (error) {
        console.error("[Content Script] Error on click:", error);
        
        if (isContextValid()) {
          chrome.runtime.sendMessage({
            action: "rewardClaimed",
            channel: extractChannelName(),
            success: false,
            points: 0,
            error: error.message,
            timestamp: new Date().toISOString(),
            method: "exact_search_error"
          });
        }
      }
    }, 500);
    
    return true;
  }
  
  console.log("[Content Script] Exact search did not find a reward button, trying selectors...");
  
  const selectors = [
    'button[aria-label*="Получить бонус"]',
    'button[aria-label*="Claim Bonus"]',
    'button[aria-label*="Claim"]',
    'button[aria-label*="получить"]',
    'button[aria-label*="claim"]',
    
    '[data-test-selector="community-points-summary"] button[aria-label*="Получить"]',
    '[data-test-selector="community-points-summary"] button[aria-label*="Claim"]',
    '.claimable-bonus__icon',
    'button:has(.claimable-bonus__icon)',
    
    '[data-a-target="tw-button-claim-bonus"]',
    '.community-points-summary button[aria-label*="Получить"]',
    '.community-points-summary button[aria-label*="Claim"]'
  ];
  
  for (const selector of selectors) {
    try {
      const button = document.querySelector(selector);
      if (button && !button.disabled && button.offsetParent !== null) {
        const buttonText = button.textContent || button.getAttribute('aria-label') || '';
        
        console.log(`[Content Script] Reward button found:`);
        console.log(`  Selector: ${selector}`);
        console.log(`  Text/Label: "${buttonText}"`);
        console.log(`  Disabled: ${button.disabled}`);
        console.log(`  Visible: ${button.offsetParent !== null}`);
        
        const isRewardButton = buttonText.toLowerCase().includes('claim') || 
                              buttonText.toLowerCase().includes('получить') ||
                              buttonText.toLowerCase().includes('бонус') ||
                              button.querySelector('.claimable-bonus__icon') ||
                              button.closest('[data-test-selector="community-points-summary"]');
        
        if (isRewardButton) {
          console.log("[Content Script] Clicking reward button found via selector:", selector);
          
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          setTimeout(() => {
            try {
              const rect = button.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              
              const mouseEvents = ['mousedown', 'mouseup', 'click'];
              mouseEvents.forEach(eventType => {
                const event = new MouseEvent(eventType, {
                  bubbles: true,
                  cancelable: true,
                  clientX: x,
                  clientY: y,
                  button: 0
                });
                button.dispatchEvent(event);
              });
              
              button.click();
              console.log("[Content Script] Click performed on reward button via selector:", selector);
              
              if (isContextValid()) {
                chrome.runtime.sendMessage({
                  action: "rewardClaimed",
                  channel: currentChannel,
                  success: true,
                  points: 50,
                  timestamp: new Date().toISOString(),
                  method: "selector_search",
                  selector: selector
                });
              }

              setTimeout(() => {
                const newButton = document.querySelector(selector);
                const stillExists = newButton && 
                                  !newButton.disabled && 
                                  newButton.offsetParent !== null;
                
                const actualSuccess = !stillExists;
                console.log(`[Content Script] Result via selector: ${actualSuccess ? 'success' : 'failure'}`);
                
                if (!actualSuccess && isContextValid()) {
                  chrome.runtime.sendMessage({
                    action: "rewardClaimed",
                    channel: currentChannel,
                    success: false,
                    timestamp: new Date().toISOString(),
                    method: "selector_search_corrected",
                    selector: selector,
                    error: "Button still present after click"
                  });
                }
              }, 3000);
              
            } catch (error) {
              console.error("[Content Script] Error on click via selector:", error);
              
              if (isContextValid()) {
                chrome.runtime.sendMessage({
                  action: "rewardClaimed",
                  channel: currentChannel,
                  success: false,
                  error: error.message,
                  timestamp: new Date().toISOString(),
                  method: "selector_search_error",
                  selector: selector
                });
              }
            }
          }, 500);
          
          return true;
        }
      }
    } catch (error) {
      console.log(`[Content Script] Selector check error ${selector}:`, error);
    }
  }
  
  console.log("[Content Script] Reward button not found using both exact and selector methods");
  if (isContextValid()) {
    chrome.runtime.sendMessage({
      action: "rewardNotFound",
      channel: currentChannel,
      timestamp: new Date().toISOString()
    });
  }
  return false;
}

function findRewardButton() {
  const communityPointsArea = document.querySelector('[data-test-selector="community-points-summary"]');
  if (communityPointsArea) {
    const buttons = communityPointsArea.querySelectorAll('button');
    
    for (const button of buttons) {
      const ariaLabel = button.getAttribute('aria-label') || '';
      const hasIcon = button.querySelector('.claimable-bonus__icon');
      
      if (ariaLabel.includes('Получить') || 
          ariaLabel.includes('бонус') || 
          ariaLabel.includes('Claim') || 
          hasIcon) {
        return button;
      }
    }
  }
  
  const allButtons = document.querySelectorAll('button');
  for (const button of allButtons) {
    const ariaLabel = button.getAttribute('aria-label') || '';
    const hasIcon = button.querySelector('.claimable-bonus__icon');
    
    if ((ariaLabel.includes('Получить бонус') || 
         ariaLabel.includes('Claim Bonus') ||
         hasIcon) && 
        button.offsetParent !== null && 
        !button.disabled) {
      return button;
    }
  }
  
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isContextValid()) {
    sendResponse({ success: false, error: "Context invalidated" });
    return;
  }
  
  console.log(`[Content Script] Got message: ${message.action}`);
  
  try {
    if (message.action === "updateChannelOverlay") {
      console.log("=== OVERLAY UPDATE ===");
      console.log("Got content:", message);
      
      overlayData = {
        channels: message.channels || [],
        liveStreams: message.liveStreams || [],
        channelStatus: message.channelStatus || {},
        showOverlay: message.showOverlay !== false
      };
      
      console.log("Updated overlayData:", overlayData);
      updateOverlayContent();
      sendResponse({ success: true });
      
    } else if (message.action === "checkRewards") {
      checkAndClaimRewards();
      sendResponse({ success: true });
    
    } else if (message.action === "getStatus") {
      checkAndClaimRewards();
      sendResponse({ success: true });
      
    } else {
      sendResponse({ success: false, error: "Unknown action" });
    }
  } catch (error) {
    console.error("[Content Script] Error handling a message:", error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
});

if (window.location.hostname === 'www.twitch.tv') {
  console.log("[Content Script] Initialization on Twitch");
  
  setTimeout(async () => {
    await loadOverlaySettings();
    
    if (isContextValid()) {
      console.log("Requesting channels data...");
      chrome.runtime.sendMessage({ action: "getChannelData" }, (response) => {
        console.log("Data request response:", response);
        if (response && response.success) {
          overlayData = {
            ...overlayData,
            ...response.data
          };
          console.log("Data loaded:", overlayData);
          updateOverlayContent();
        } else {
          console.error("Error receiving data:", response);
        }
      });
    }
    
    console.log("Starting rewards monitoring...");
    
    setTimeout(() => {
      console.log("First rewards check...");
      checkAndClaimRewards();
    }, 5000);
    
    setTimeout(() => {
      if (isContextValid()) {
        refreshOverlayData();
      }
    }, 2000);
    
    setInterval(() => {
      if (isContextValid()) {
        refreshOverlayData();
      }
    }, 10000);
    
    setInterval(() => {
      console.log("Periodic rewards check...");
      if (isContextValid() && extractChannelName()) {
        checkAndClaimRewards();
      }
    }, 30000);
    
  }, 3000);
} 

console.log("[Content Script] Script initialized on Twitch content page");