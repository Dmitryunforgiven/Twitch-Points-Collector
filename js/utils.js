class TwitchUtils {
  static validateUsername(username) {
    return /^[a-zA-Z0-9_]{3,25}$/.test(username);
  }

  static formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  static getChannelFromUrl(url) {
    const match = url.match(/twitch\.tv\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  static isValidTwitchUrl(url) {
    return /^https:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]+/.test(url);
  }

  static formatViewerCount(count) {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
  }

  static generateRandomDelay(min = 1000, max = 3000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static async retry(fn, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        await this.sleep(delay * attempt);
      }
    }
  }

  static sanitizeChannelName(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  }

  static getStorageSize() {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
        resolve(bytes);
      });
    });
  }

  static async clearOldLogs(maxAge = 7 * 24 * 60 * 60 * 1000) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['logs'], (result) => {
        const logs = result.logs || [];
        const cutoff = Date.now() - maxAge;
        
        const filteredLogs = logs.filter(log => {
          const logTime = new Date(log.timestamp).getTime();
          return logTime > cutoff;
        });
        
        chrome.storage.local.set({ logs: filteredLogs }, () => {
          resolve(logs.length - filteredLogs.length);
        });
      });
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TwitchUtils;
}