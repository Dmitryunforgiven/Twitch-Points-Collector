# Twitch Points Collector

A Chrome extension that automatically monitors Twitch streams, opens them in new tabs or windows when they go live and collects rewards.

My python script stopped working properly (thx to google nerfing remote debugging port) so i decided to make this...

## Features

- Automatic stream opening when broadcasts start
- Support for multiple channels
- Configurable check interval
- Channel status overlay display
- Automatic reward collection
- Detailed logging
- Auto-start with browser launch

## Installation

1. Download the latest version of the extension
2. Extract the archive to a convenient location
3. Open Chrome and navigate to extensions (chrome://extensions/)
4. Enable "Developer mode"
5. Click "Load unpacked" and select the extension folder

## Configuration

1. Click on the extension icon in Chrome
2. Open extension settings
3. Enter required credentials:
   - Client ID  
   - User ID  
   - Redirect URI  
4. Click "Save"

## Usage

1. After installation and configuration, the extension will automatically begin monitoring specified channels
2. When a tracked channel starts streaming, the extension will automatically open it in a new tab or window
3. Channel status is displayed in an overlay on Twitch pages
4. All actions are logged and available for review

## Requirements

- Latest version of Google Chrome
- Active Twitch account 
- Configured Twitch API keys

## Limitations

⚠️ **Browser Language Requirement**  
The extension may not function properly if your browser's interface language is set to anything other than English or Russian (Russian is tested and works for sure). Otherwise you might need to add your own selectors in content.js

## ToDos:

1. Fix rewards statistics per channel loading
2. Fix extension spamming errors (doesn't seem to affect the functionality)
3. Fix logs export button (currently commented out)