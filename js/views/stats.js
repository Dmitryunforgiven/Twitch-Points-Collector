let rewardStats = {};
let channelStatus = {};
let channels = [];
let liveStreams = [];

function formatDate(dateString) {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  const userLocale = navigator.language || 'en-US';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  return date.toLocaleString(userLocale, {
    timeZone: timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadStats() {
  console.log("Loading stats...");
  
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getChannelData" }, (response) => {
        console.log("Received response from background:", response);
        resolve(response);
      });
    });

    if (!response || !response.success) {
      console.error("Failed to get channel data from background");
      return;
    }

    const data = response.data;
    console.log("Received data:", data);

    channels = data.channels || [];
    channelStatus = data.channelStatus || {};
    rewardStats = data.rewardStats || {};
    liveStreams = data.liveStreams || [];

    console.log("Processed data:", {
      channels,
      channelStatus,
      rewardStats,
      liveStreams
    });

    channels.forEach(channel => {
      const isLive = liveStreams.some(stream => 
        stream.user_login.toLowerCase() === channel.toLowerCase()
      );
      channelStatus[channel] = isLive ? 'live' : 'offline';
    });

    updateSummary();
    renderChannelStats();
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

function updateSummary() {
  console.log("Updating summary...");
  console.log("Current data:", { channels, rewardStats, channelStatus });

  const totalRewards = Object.values(rewardStats).reduce((sum, channel) => 
    sum + (channel.totalRewards || 0), 0
  );

  const today = new Date().toDateString();
  const todayRewards = Object.values(rewardStats).reduce((sum, channel) => 
    sum + (channel.dailyStats?.[today] || 0), 0
  );

  const activeChannels = channels.filter(channel => 
    channelStatus[channel] === 'live'
  ).length;

  let avgPerDay = 0;
  if (Object.keys(rewardStats).length > 0) {
    const totalDays = Object.values(rewardStats).reduce((sum, channel) => {
      if (!channel.firstReward) return sum;
      const firstDate = new Date(channel.firstReward);
      const days = Math.max(1, Math.ceil((new Date() - firstDate) / (1000 * 60 * 60 * 24)));
      return sum + days;
    }, 0);
    avgPerDay = totalRewards / totalDays;
  }

  console.log("Summary update:", {
    totalRewards,
    todayRewards,
    activeChannels,
    avgPerDay
  });

  const elements = {
    totalRewards: document.getElementById('totalRewards'),
    todayRewards: document.getElementById('todayRewards'),
    activeChannels: document.getElementById('activeChannels'),
    avgPerDay: document.getElementById('avgPerDay')
  };

  if (elements.totalRewards) elements.totalRewards.textContent = totalRewards;
  if (elements.todayRewards) elements.todayRewards.textContent = todayRewards;
  if (elements.activeChannels) elements.activeChannels.textContent = activeChannels;
  if (elements.avgPerDay) elements.avgPerDay.textContent = avgPerDay.toFixed(1);
}

function renderChannelStats() {
  const container = document.getElementById('statsContainer');
  if (!container) {
    console.error('Container not found');
    return;
  }

  const allChannelsWithStats = Object.keys(rewardStats);

  const allChannels = [...new Set([...channels, ...allChannelsWithStats])];

  if (allChannels.length === 0) {
    container.innerHTML = '<div class="no-data">No channels set up</div>';
    return;
  }

  const channelsHtml = allChannels.map(channel => {
    const stats = rewardStats[channel] || {
      totalRewards: 0,
      errors: 0,
      dailyStats: {},
      lastReward: null,
      firstReward: null
    };

    const isActiveChannel = channels.includes(channel);
    const isLive = channelStatus[channel] === 'live';
    const today = new Date().toDateString();
    const todayCount = stats.dailyStats[today] || 0;
    
    let statusClass = 'status-offline';
    let statusTitle = 'Offline';
    
    if (!isActiveChannel) {
      statusClass = 'status-inactive';
      statusTitle = 'Not in monitoring list';
    } else if (isLive) {
      statusClass = 'status-live';
      statusTitle = 'Live';
    }
    
    return `
      <div class="channel-card ${!isActiveChannel ? 'inactive-channel' : ''}">
        <div class="channel-name">
          ${channel}
          <span class="channel-status ${statusClass}" 
                title="${statusTitle}"></span>
        </div>
        
        ${!isActiveChannel ? '<div class="inactive-notice">Channel not in current monitoring list</div>' : ''}
        
        <div class="stat-item">
          <span class="stat-label">Total rewards collected:</span>
          <span class="stat-value">${stats.totalRewards || 0}</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">Rewards claimed today:</span>
          <span class="stat-value">${todayCount}</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">Last reward:</span>
          <span class="stat-value">${stats.lastReward ? formatDate(stats.lastReward) : 'Never'}</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">First reward:</span>
          <span class="stat-value">${stats.firstReward ? formatDate(stats.firstReward) : 'Unknown'}</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">Claim errors:</span>
          <span class="stat-value">${stats.errors || 0}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = channelsHtml;
}

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

function updateLastUpdated() {
  const now = new Date();
  const lastUpdated = document.getElementById("lastUpdated");
  const userLocale = navigator.language || 'en-US';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  lastUpdated.textContent = `Last update: ${now.toLocaleString(userLocale, {
    timeZone: timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}`;
}

function forceRefresh() {
  console.log("Forcing stats refresh...");
  loadStats();
}

const refreshButton = document.getElementById("refreshStats");
const clearButton = document.getElementById("clearStats");
const exportButton = document.getElementById("exportStats");

refreshButton.addEventListener("click", forceRefresh);

clearButton.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all reward statistics? This action cannot be undone.")) {
    chrome.storage.local.remove("rewardStats", () => {
      rewardStats = {};
      updateSummary();
      renderChannelStats();
      updateLastUpdated();
      console.log("Successfully cleared reward statistics");
    });
  }
});

exportButton.addEventListener("click", () => {
  const dataStr = JSON.stringify(rewardStats, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `twitch-rewards-stats-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Received message:", message);
  
  if (message.action === "statsUpdated") {
    console.log("Stats update received:", message);
    if (message.stats) rewardStats = message.stats;
    if (message.channelStatus) channelStatus = message.channelStatus;
    if (message.channels) channels = message.channels;
    if (message.liveStreams) liveStreams = message.liveStreams;
    
    updateSummary();
    renderChannelStats();
  } else if (message.action === "log") {
    console.log("Log received:", message.log);
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log("Storage changed:", changes);
  
  if (namespace === 'local') {
    if (changes.channels) {
      channels = changes.channels.newValue || [];
      renderChannelStats();
    }
    if (changes.channelStatus) {
      channelStatus = changes.channelStatus.newValue || {};
      updateSummary();
      renderChannelStats();
    }
    if (changes.rewardStats) {
      rewardStats = changes.rewardStats.newValue || {};
      updateSummary();
      renderChannelStats();
    }
    if (changes.lastLiveStreams) {
      liveStreams = changes.lastLiveStreams.newValue || [];
      updateSummary();
      renderChannelStats();
    }
  }
});

function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .stats-container {
      padding: 20px;
      font-family: Arial, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
    }

    .summary-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }

    .stat-box {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #2c3e50;
      margin-bottom: 5px;
    }

    .stat-label {
      font-size: 14px;
      color: #7f8c8d;
    }

    .channel-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }

    .channel-card {
      background: #fff;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .inactive-channel {
      opacity: 0.7;
      border-left: 4px solid #f39c12;
    }

    .inactive-notice {
      background: #fff3cd;
      color: #856404;
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 10px;
      border: 1px solid #ffeaa7;
    }

    .channel-name {
      font-size: 16px;
      font-weight: bold;
      color: #2c3e50;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .channel-status {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: inline-block;
    }

    .status-live {
      background-color: #e74c3c;
    }

    .status-offline {
      background-color: #95a5a6;
    }

    .status-inactive {
      background-color: #f39c12;
    }

    .stat-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      padding: 8px 0;
      border-top: 1px solid #eee;
    }

    .stat-item:first-child {
      border-top: none;
    }

    .stat-item .stat-label {
      color: #7f8c8d;
    }

    .stat-item .stat-value {
      font-size: 14px;
      margin: 0;
      font-weight: normal;
    }

    .no-data {
      text-align: center;
      padding: 40px;
      color: #7f8c8d;
      font-size: 16px;
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded, initializing stats...");
  addStyles();
  setTimeout(() => {
    loadStats();
    setInterval(loadStats, 30000);
  }, 100);
});