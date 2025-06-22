document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM is loaded, starting config.js initialization");
  
  const channelsInput = document.getElementById("channels");
  const delayInput = document.getElementById("delay");
  const muteCheckbox = document.getElementById("mute");
  const minimizeCheckbox = document.getElementById("minimize");
  const maximizeCheckbox = document.getElementById("maximize");
  const separateWindowCheckbox = document.getElementById("separateWindow");
  const windowBehaviorSection = document.getElementById("windowBehaviorSection");
  const status = document.getElementById("status");
  const saveButton = document.getElementById("saveConfig");
  const testButton = document.getElementById("testChannels");
  const resetButton = document.getElementById("resetConfig");
  const detailedLoggingCheckbox = document.getElementById("detailedLogging");
  const showOverlayCheckbox = document.getElementById("showOverlay");
  const clientIdInput = document.getElementById("clientId");
  const userIdInput = document.getElementById("userId");
  const redirectUriInput = document.getElementById("redirectUri");

  console.log("Found elements:", {
    channelsInput: !!channelsInput,
    delayInput: !!delayInput,
    muteCheckbox: !!muteCheckbox,
    minimizeCheckbox: !!minimizeCheckbox,
    maximizeCheckbox: !!maximizeCheckbox,
    separateWindowCheckbox: !!separateWindowCheckbox,
    windowBehaviorSection: !!windowBehaviorSection,
    status: !!status,
    saveButton: !!saveButton,
    testButton: !!testButton,
    resetButton: !!resetButton,
    detailedLoggingCheckbox: !!detailedLoggingCheckbox,
    showOverlayCheckbox: !!showOverlayCheckbox,
    clientIdInput: !!clientIdInput,
    userIdInput: !!userIdInput,
    redirectUriInput: !!redirectUriInput
  });

  const requiredElements = {
    channelsInput,
    delayInput,
    status,
    saveButton
  };

  const missingElements = Object.entries(requiredElements)
    .filter(([name, element]) => !element)
    .map(([name]) => name);

  if (missingElements.length > 0) {
    console.error("Absent HTML elements:", missingElements);
    alert(`Error: HTML elements absent: ${missingElements.join(', ')}`);
    return;
  }

  function updateStatus(message, isError = false) {
    if (!status) {
      console.log("Status element not found:", message);
      return;
    }
    
    status.innerHTML = message;
    status.className = isError ? "status-error" : "status-success";
    status.style.display = "block";
    console.log("Config status:", message);
  }

  function validateChannelName(channel) {
    return /^[a-zA-Z0-9_]{3,25}$/.test(channel);
  }

  function toggleWindowBehaviorSection() {
    if (!separateWindowCheckbox || !windowBehaviorSection) {
      console.log("Window behavior elements not found");
      return;
    }
    
    if (separateWindowCheckbox.checked) {
      windowBehaviorSection.style.display = "block";
    } else {
      windowBehaviorSection.style.display = "none";
      if (minimizeCheckbox) minimizeCheckbox.checked = false;
      if (maximizeCheckbox) maximizeCheckbox.checked = false;
      if (muteCheckbox) muteCheckbox.checked = false;
    }
  }

  function loadConfig() {
    console.log("Loading configuration...");
    
    chrome.storage.local.get([
      "channels", 
      "delay", 
      "mute", 
      "minimize", 
      "maximize", 
      "separateWindow",
      "detailedLogging",
      "showOverlay",
      "clientId",
      "userId",
      "redirectUri"
    ], (result) => {
      console.log("Loaded config from storage:", result);
      
      const config = {
        channels: result.channels || [],
        delay: result.delay || 300,
        mute: result.mute || false,
        minimize: result.minimize || false,
        maximize: result.maximize || false,
        separateWindow: result.separateWindow || false,
        detailedLogging: result.detailedLogging || false,
        showOverlay: result.showOverlay !== false,
        clientId: result.clientId || '',
        userId: result.userId || '',
        redirectUri: result.redirectUri || ''
      };
      
      console.log("Processed configuration:", config);
      
      if (channelsInput) {
        channelsInput.value = config.channels.join("\n");
      }
      if (delayInput) {
        delayInput.value = config.delay;
      }
      if (muteCheckbox) {
        muteCheckbox.checked = config.mute;
        console.log("Mute checkbox set to:", config.mute);
      }
      if (minimizeCheckbox) {
        minimizeCheckbox.checked = config.minimize;
        console.log("Minimize checkbox set to:", config.minimize);
      }
      if (maximizeCheckbox) {
        maximizeCheckbox.checked = config.maximize;
        console.log("Maximize checkbox set to:", config.maximize);
      }
      if (separateWindowCheckbox) {
        separateWindowCheckbox.checked = config.separateWindow;
        console.log("Separate window checkbox set to:", config.separateWindow);
      }
      
      if (detailedLoggingCheckbox) {
        detailedLoggingCheckbox.checked = config.detailedLogging;
        console.log("Detailed logging checkbox set to:", config.detailedLogging);
      } else {
        console.error("detailedLoggingCheckbox not found in DOM!");
      }
      
      if (showOverlayCheckbox) {
        showOverlayCheckbox.checked = config.showOverlay;
        console.log("Show overlay checkbox set to:", config.showOverlay);
      } else {
        console.error("showOverlayCheckbox not found in DOM!");
      }
      
      if (clientIdInput) {
        clientIdInput.value = config.clientId;
        console.log("Client ID set to:", config.clientId);
      } else {
        console.error("clientIdInput not found in DOM!");
      }
      
      if (userIdInput) {
        userIdInput.value = config.userId;
        console.log("User ID set to:", config.userId);
      } else {
        console.error("userIdInput not found in DOM!");
      }
      
      if (redirectUriInput) {
        redirectUriInput.value = config.redirectUri;
        console.log("Redirect URI set to:", config.redirectUri);
      } else {
        console.error("redirectUriInput not found in DOM!");
      }
      
      chrome.storage.local.set(config, () => {
        console.log("Configuration normalized and saved:", config);
      });
      
      toggleWindowBehaviorSection();
      
      const channelCount = config.channels.length;
      updateStatus(`Configuration loaded. Channels: ${channelCount}, Overlay: ${config.showOverlay ? 'enabled' : 'disabled'}, Logs: ${config.detailedLogging ? 'enabled' : 'disabled'}`);
      
      validateForm();
    });
  }

  function validateForm() {
    if (!channelsInput || !delayInput || !saveButton) {
      console.log("Required form elements not found");
      return false;
    }
    
    const channelsText = channelsInput.value.trim();
    const delayValue = parseInt(delayInput.value, 10);
    
    let isValid = true;
    let errors = [];

    if (!channelsText) {
      errors.push("Specify at least one channel to monitor");
      isValid = false;
    } else {
      const channels = channelsText.split("\n").map(c => c.trim()).filter(c => c);
      const invalidChannels = channels.filter(channel => !validateChannelName(channel));
      
      if (invalidChannels.length > 0) {
        errors.push(`Incorrect channel names: ${invalidChannels.join(", ")}`);
        isValid = false;
      }
    }

    if (isNaN(delayValue) || delayValue < 60) {
      errors.push("Minimal delay: 60 seconds");
      isValid = false;
    }

    if (separateWindowCheckbox && minimizeCheckbox && maximizeCheckbox) {
      if (separateWindowCheckbox.checked && minimizeCheckbox.checked && maximizeCheckbox.checked) {
        errors.push("Cannot enable both minimize and maximize for separate windows");
        isValid = false;
      }
    }

    saveButton.disabled = !isValid;
    
    if (errors.length > 0) {
      updateStatus(errors.join("<br>"), true);
    } else if (channelsText) {
      const channels = channelsText.trim().split("\n").map(c => c.trim()).filter(c => c);
      updateStatus(`Ready for saving: ${channels.length} channels, interval ${delayValue}s`);
    }

    return isValid;
  }

  if (channelsInput) {
    channelsInput.addEventListener("input", () => {
      const channels = channelsInput.value.trim().split("\n")
        .map(c => c.trim())
        .filter(c => c);
      
      if (channels.length === 0) {
        updateStatus("Specify channels to monitor", true);
      } else {
        updateStatus(`Channels in the list: ${channels.length}`);
      }
      
      setTimeout(validateForm, 500);
    });
  }

  if (delayInput) {
    delayInput.addEventListener("input", validateForm);
  }

  if (separateWindowCheckbox) {
    separateWindowCheckbox.addEventListener("change", () => {
      console.log("Separate window changed:", separateWindowCheckbox.checked);
      toggleWindowBehaviorSection();
      validateForm();
    });
  }

  if (minimizeCheckbox) {
    minimizeCheckbox.addEventListener("change", validateForm);
  }

  if (maximizeCheckbox) {
    maximizeCheckbox.addEventListener("change", validateForm);
  }

  if (muteCheckbox) {
    muteCheckbox.addEventListener("change", validateForm);
  }

  if (detailedLoggingCheckbox) {
    detailedLoggingCheckbox.addEventListener("change", () => {
      console.log("Detailed logging changed:", detailedLoggingCheckbox.checked);
      validateForm();
    });
  } else {
    console.error("Couldn't add a handler for detailedLoggingCheckbox - element not found");
  }

  if (showOverlayCheckbox) {
    showOverlayCheckbox.addEventListener("change", () => {
      console.log("Show overlay changed:", showOverlayCheckbox.checked);
      validateForm();
    });
  } else {
    console.error("Couldn't add a handler for showOverlayCheckbox - element not found");
  }

  if (clientIdInput) {
    clientIdInput.addEventListener("input", () => {
      console.log("Client ID changed:", clientIdInput.value);
      validateForm();
    });
  } else {
    console.error("Couldn't add a handler for clientIdInput - element not found");
  }

  if (userIdInput) {
    userIdInput.addEventListener("input", () => {
      console.log("User ID changed:", userIdInput.value);
      validateForm();
    });
  } else {
    console.error("Couldn't add a handler for userIdInput - element not found");
  }

  if (redirectUriInput) {
    redirectUriInput.addEventListener("input", () => {
      console.log("Redirect URI changed:", redirectUriInput.value);
      validateForm();
    });
  } else {
    console.error("Couldn't add a handler for redirectUriInput - element not found");
  }

  if (saveButton) {
    saveButton.addEventListener("click", async () => {
      console.log("Save button clicked");
      
      if (!validateForm()) {
        console.log("Form validation failed, not saving");
        return;
      }

      const channelsText = channelsInput.value.trim();
      const channels = channelsText.split("\n").map(c => c.trim()).filter(c => c);
      const delayValue = parseInt(delayInput.value, 10);
      
      const config = {
        channels: channels,
        delay: delayValue,
        separateWindow: separateWindowCheckbox ? separateWindowCheckbox.checked : false,
        mute: muteCheckbox ? muteCheckbox.checked : false,
        minimize: minimizeCheckbox ? minimizeCheckbox.checked : false,
        maximize: maximizeCheckbox ? maximizeCheckbox.checked : false,
        detailedLogging: detailedLoggingCheckbox ? detailedLoggingCheckbox.checked : false,
        showOverlay: showOverlayCheckbox ? showOverlayCheckbox.checked : true,
        clientId: clientIdInput ? clientIdInput.value.trim() : '',
        userId: userIdInput ? userIdInput.value.trim() : '',
        redirectUri: redirectUriInput ? redirectUriInput.value.trim() : ''
      };
      
      console.log("Saving config:", config);
      
      updateStatus("Saving configuration...");
      saveButton.disabled = true;
      
      chrome.storage.local.set(config, () => {
        saveButton.disabled = false;
        
        if (chrome.runtime.lastError) {
          updateStatus(`Save error: ${chrome.runtime.lastError.message}`, true);
          console.error("Save error:", chrome.runtime.lastError);
          return;
        }
        
        console.log("Config saved successfully:", config);

        chrome.runtime.sendMessage({ 
          action: "forceUpdateOverlay",
          showOverlay: config.showOverlay
        }, (response) => {
          console.log("Force update overlay response:", response);
        });
        
        let statusMessage = `✅ Config saved!<br>Channels: ${channels.length}, Interval: ${delayValue}s<br>`;
        statusMessage += `Separate windows: ${config.separateWindow ? 'enabled' : 'disabled'}<br>`;
        statusMessage += `Overlay: ${config.showOverlay ? 'enabled' : 'disabled'}<br>`;
        statusMessage += `Extended logs: ${config.detailedLogging ? 'enabled' : 'disabled'}`;

        if (config.separateWindow) {
          const windowOptions = [];
          if (config.mute) windowOptions.push('sound disabled');
          if (config.minimize) windowOptions.push('minimization');
          if (config.maximize) windowOptions.push('maximization');
          
          if (windowOptions.length > 0) {
            statusMessage += `<br>Window settings: ${windowOptions.join(', ')}`;
          }
        }
        
        updateStatus(statusMessage);
        
        chrome.runtime.sendMessage({ 
          action: "configUpdated", 
          config: config 
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error notifying background:", chrome.runtime.lastError);
          } else {
            console.log("Background notified successfully");
          }
        });
      });
    });
  }

 if (testButton) {
    testButton.addEventListener("click", async () => {
      if (!channelsInput) return;
      
      const channelsText = channelsInput.value.trim();
      if (!channelsText) {
        updateStatus("Insert channels for checking", true);
        return;
      }
      
      const channels = channelsText.split("\n").map(c => c.trim()).filter(c => c);
      
      updateStatus("🔍 Checking channels...");
      testButton.disabled = true;
      
      try {
        const results = [];
        
        for (const channel of channels) {
          if (!validateChannelName(channel)) {
            results.push(`❌ ${channel}: invalid name`);
            continue;
          }
          
          try {
            const response = await fetch(`https://decapi.me/twitch/avatar/${channel}`);
            if (response.ok) {
              results.push(`✅ ${channel}: found`);
            } else {
              results.push(`❌ ${channel}: not found`);
            }
          } catch (error) {
            results.push(`⚠️ ${channel}: unable to check`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        updateStatus(`Check result:<br>${results.join("<br>")}`);
        
      } catch (error) {
        updateStatus(`Check error: ${error.message}`, true);
      } finally {
        testButton.disabled = false;
      }
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      if (confirm("Are you sure you want to reset all settings? This action cannot be undone.")) {
        if (channelsInput) channelsInput.value = "";
        if (delayInput) delayInput.value = 300;
        if (muteCheckbox) muteCheckbox.checked = false;
        if (minimizeCheckbox) minimizeCheckbox.checked = false;
        if (maximizeCheckbox) maximizeCheckbox.checked = false;
        if (separateWindowCheckbox) separateWindowCheckbox.checked = false;
        if (detailedLoggingCheckbox) detailedLoggingCheckbox.checked = false;
        if (showOverlayCheckbox) showOverlayCheckbox.checked = true;
        if (clientIdInput) clientIdInput.value = '';
        if (userIdInput) userIdInput.value = '';
        if (redirectUriInput) redirectUriInput.value = '';
        
        toggleWindowBehaviorSection();
        updateStatus("Settings reset to defaults");
        validateForm();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      if (saveButton && !saveButton.disabled) {
        saveButton.click();
      }
    }
  });


  console.log("Starting loadConfig()");
  loadConfig();

    window.addEventListener("beforeunload", () => {
    if (saveButton && !saveButton.disabled && validateForm()) {
      if (!channelsInput || !delayInput) return;
      
      const channelsText = channelsInput.value.trim();
      const channels = channelsText.split("\n").map(c => c.trim()).filter(c => c);
      const delayValue = parseInt(delayInput.value, 10);
      
      const config = {
        channels: channels,
        delay: delayValue,
        separateWindow: separateWindowCheckbox ? separateWindowCheckbox.checked : false,
        mute: muteCheckbox ? muteCheckbox.checked : false,
        minimize: minimizeCheckbox ? minimizeCheckbox.checked : false,
        maximize: maximizeCheckbox ? maximizeCheckbox.checked : false,
        detailedLogging: detailedLoggingCheckbox ? detailedLoggingCheckbox.checked : false,
        showOverlay: showOverlayCheckbox ? showOverlayCheckbox.checked : true,
        clientId: clientIdInput ? clientIdInput.value.trim() : '',
        userId: userIdInput ? userIdInput.value.trim() : '',
        redirectUri: redirectUriInput ? redirectUriInput.value.trim() : ''
      };
      
      chrome.storage.local.set(config);
    }
  });
});