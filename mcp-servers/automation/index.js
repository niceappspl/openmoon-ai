#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Use built-in fetch (Node.js 18+) or import node-fetch for older versions
const fetch = globalThis.fetch || (await import('node-fetch')).default;

/**
 * Resolve the Wi-Fi hardware interface (e.g. en0). Falls back to en0.
 */
async function getWifiInterface() {
  try {
    const { stdout } = await execAsync("networksetup -listallhardwareports");
    const lines = stdout.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("Wi-Fi") || lines[i].includes("AirPort")) {
        for (let j = i + 1; j < lines.length; j++) {
          const match = lines[j].match(/^\s*Device:\s*(.+)/);
          if (match) return match[1].trim();
          if (lines[j].trim() === "") break;
        }
      }
    }
  } catch {}
  return "en0";
}

/**
 * Resolve the current Wi-Fi SSID on modern macOS (14+), where `airport -I` and
 * `networksetup -getairportnetwork` no longer return it. Tries the fastest
 * source first and falls back gracefully. Returns null when no SSID is found.
 */
async function getWifiSsid(iface) {
  const wifiIface = iface ?? (await getWifiInterface());

  // 1. ipconfig getsummary: SSID or NetworkID lines
  try {
    const { stdout } = await execAsync(`ipconfig getsummary ${wifiIface}`);
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      for (const prefix of ["SSID :", "NetworkID :"]) {
        if (trimmed.startsWith(prefix)) {
          const value = trimmed.slice(prefix.length).trim();
          if (value) return value;
        }
      }
    }
  } catch {}

  // 2. system_profiler: SSID is the indented line under "Current Network Information:"
  try {
    const { stdout } = await execAsync("system_profiler SPAirPortDataType");
    const block = stdout.split("Current Network Information:")[1];
    if (block) {
      for (const line of block.split("\n")) {
        const match = line.match(/^\s+([^:\n]+):\s*$/);
        if (match && match[1].trim()) return match[1].trim();
      }
    }
  } catch {}

  // 3. networksetup (legacy; still works on some macOS versions)
  try {
    const { stdout } = await execAsync(`networksetup -getairportnetwork ${wifiIface}`);
    const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/);
    if (match && match[1].trim() && !match[1].includes("not associated")) {
      return match[1].trim();
    }
  } catch {}

  return null;
}

// Ensure /tmp/moonos directory exists
import fs from 'fs';
const MOONOS_TMP_DIR = '/tmp/moonos';
if (!fs.existsSync(MOONOS_TMP_DIR)) {
  fs.mkdirSync(MOONOS_TMP_DIR, { recursive: true });
}

// Clean up old temporary files (older than 24 hours)
try {
  const files = fs.readdirSync(MOONOS_TMP_DIR);
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  files.forEach(file => {
    if (file.startsWith('applescript_') && file.endsWith('.scpt')) {
      const filePath = `${MOONOS_TMP_DIR}/${file}`;
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > ONE_DAY) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        // Ignore errors for individual files
      }
    }
  });
} catch (e) {
  // Ignore cleanup errors
}

const server = new Server(
  {
    name: "moonos-automation-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// AppleScript helper with timeout
async function runAppleScript(script, timeoutMs = 15000) {
  try {
    // Write script to temp file to avoid escaping issues
    const path = await import('path');
    const tempFile = path.join(MOONOS_TMP_DIR, `applescript_${Date.now()}.scpt`);

    fs.writeFileSync(tempFile, script);

    const { stdout, stderr } = await execAsync(`osascript "${tempFile}"`, { timeout: timeoutMs });

    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }

    if (stderr) throw new Error(stderr);
    return stdout.trim();
  } catch (error) {
    if (error.code === 'TIMEOUT') {
      throw new Error(`AppleScript timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Tool definitions
const TOOLS = [
  {
    name: "open_app",
    description: "Open a macOS application by name",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description: "Application name (e.g., 'Visual Studio Code', 'Safari', 'Spotify')",
        },
      },
      required: ["app"],
    },
  },
  {
    name: "quit_app",
    description: "Quit a running macOS application",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description: "Application name to quit",
        },
      },
      required: ["app"],
    },
  },
  {
    name: "focus_mode",
    description: "Enable/disable Do Not Disturb mode",
    inputSchema: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true to enable, false to disable",
        },
      },
      required: ["enabled"],
    },
  },
  {
    name: "get_running_apps",
    description: "Get list of currently running applications",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_installed_apps",
    description: "Get list of all installed applications (including built-in macOS apps)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_app_icon_mapping",
    description: "Get mapping of localized app names to system names for icon retrieval",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "run_shell_command",
    description: "Execute a shell command (use with caution)",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "set_volume",
    description: "Set system volume (0-100)",
    inputSchema: {
      type: "object",
      properties: {
        volume: {
          type: "number",
          description: "Volume level from 0 to 100",
          minimum: 0,
          maximum: 100,
        },
      },
      required: ["volume"],
    },
  },
  {
    name: "get_clipboard",
    description: "Get current clipboard content",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_clipboard",
    description: "Set clipboard content",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to copy to clipboard",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "take_screenshot",
    description: "Take a screenshot and save to specified path",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path where to save screenshot (default: ~/Desktop/screenshot.png)",
        },
        interactive: {
          type: "boolean",
          description: "If true, allows user to select area",
        },
      },
    },
  },
  {
    name: "show_notification",
    description: "Display a macOS notification",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Notification title",
        },
        message: {
          type: "string",
          description: "Notification message",
        },
      },
      required: ["title", "message"],
    },
  },
  {
    name: "get_system_info",
    description: "Get system information (OS version, hardware, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["all", "hardware", "software", "network", "storage"],
          description: "Type of information to retrieve",
        },
      },
    },
  },
  {
    name: "empty_trash",
    description: "Empty the system trash",
    inputSchema: {
      type: "object",
      properties: {
        secure: {
          type: "boolean",
          description: "Securely empty trash (slower but more secure)",
        },
      },
    },
  },
  {
    name: "lock_screen",
    description: "Lock the computer screen",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "sleep_display",
    description: "Put display to sleep",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "restart_computer",
    description: "Restart the computer (with confirmation)",
    inputSchema: {
      type: "object",
      properties: {
        delay: {
          type: "number",
          description: "Delay in seconds before restart",
        },
      },
    },
  },
  {
    name: "shutdown_computer",
    description: "Shutdown the computer (with confirmation)",
    inputSchema: {
      type: "object",
      properties: {
        delay: {
          type: "number",
          description: "Delay in seconds before shutdown",
        },
      },
    },
  },
  {
    name: "toggle_wifi",
    description: "Turn WiFi on or off",
    inputSchema: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true to enable, false to disable WiFi",
        },
      },
      required: ["enabled"],
    },
  },
  {
    name: "toggle_bluetooth",
    description: "Turn Bluetooth on or off",
    inputSchema: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true to enable, false to disable Bluetooth",
        },
      },
      required: ["enabled"],
    },
  },
  {
    name: "get_battery_status",
    description: "Get battery status and power information",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_wifi_info",
    description: "Get WiFi connection status and network information",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "toggle_dark_mode",
    description: "Toggle system dark mode",
    inputSchema: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true for dark mode, false for light mode",
        },
      },
    },
  },
  {
    name: "mail_search",
    description: "Search emails in Apple Mail",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for emails",
        },
        limit: {
          type: "number",
          description: "Maximum number of emails to return (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "mail_unread",
    description: "Get unread emails from Apple Mail",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of emails to return (default: 10)",
        },
      },
    },
  },
  {
    name: "mail_read",
    description: "Read the content of a specific email by subject or index",
    inputSchema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Subject of the email to read (partial match)",
        },
        index: {
          type: "number",
          description: "Index of unread email to read (1-based)",
        },
        unread_only: {
          type: "boolean",
          description: "Whether to search only in unread emails (default: true)",
        },
      },
    },
  },
  {
    name: "mail_send",
    description: "Send email using Apple Mail",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body content",
        },
        cc: {
          type: "string",
          description: "CC email address (optional)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "maps_search",
    description: "Search for locations using Apple Maps",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for locations",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "maps_directions",
    description: "Get directions using Apple Maps",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Starting address or location",
        },
        to: {
          type: "string",
          description: "Destination address or location",
        },
        transport: {
          type: "string",
          enum: ["driving", "walking", "transit"],
          description: "Transportation method (default: driving)",
        },
      },
      required: ["to"],
    },
  },
  {
    name: "calendar_events",
    description: "Get calendar events",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look ahead (default: 7)",
        },
      },
    },
  },
  {
    name: "calendar_create",
    description: "Create calendar event",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Event title",
        },
        start: {
          type: "string",
          description: "Start date/time (YYYY-MM-DD HH:MM)",
        },
        end: {
          type: "string",
          description: "End date/time (YYYY-MM-DD HH:MM)",
        },
        location: {
          type: "string",
          description: "Event location (optional)",
        },
        notes: {
          type: "string",
          description: "Event notes (optional)",
        },
      },
      required: ["title", "start", "end"],
    },
  },
  {
    name: "messages_send",
    description: "Send message via Messages app",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient phone number or email",
        },
        message: {
          type: "string",
          description: "Message content",
        },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "reminders_list",
    description: "List reminders",
    inputSchema: {
      type: "object",
      properties: {
        completed: {
          type: "boolean",
          description: "Include completed reminders (default: false)",
        },
      },
    },
  },
  {
    name: "reminders_create",
    description: "Create reminder",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Reminder title",
        },
        due: {
          type: "string",
          description: "Due date/time (optional)",
        },
        notes: {
          type: "string",
          description: "Reminder notes (optional)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "notes_list",
    description: "List notes",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of notes to return (default: 10)",
        },
      },
    },
  },
  {
    name: "notes_create",
    description: "Create note",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note title",
        },
        content: {
          type: "string",
          description: "Note content",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "contacts_search",
    description: "Search contacts",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_current_time",
    description: "Get current date and time",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_current_date",
    description: "Get current date only",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "window_manage",
    description: "Move/resize the frontmost window: maximize, snap to left/right half, or center",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["maximize", "left", "right", "center"],
          description: "Window placement action",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "set_brightness",
    description: "Adjust display brightness up or down (relative steps)",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down"],
          description: "Increase or decrease brightness",
        },
        steps: {
          type: "number",
          description: "Number of brightness steps (default 4, each ~6%)",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "type_text",
    description: "Type text into the frontmost application (simulates keyboard input)",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to type",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "wifi_scan",
    description: "List available and preferred WiFi networks",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "wifi_connect",
    description: "Connect to a WiFi network by SSID (optional password)",
    inputSchema: {
      type: "object",
      properties: {
        ssid: {
          type: "string",
          description: "Network name (SSID) to join",
        },
        password: {
          type: "string",
          description: "Network password (omit for open networks)",
        },
      },
      required: ["ssid"],
    },
  },
];

// Handle tool list request
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
        case "open_app": {
          try {
          // Find the actual app name using mdls for localized names
          let actualAppName = args.app;
          let systemAppName = args.app; // Keep track of the system name for opening
          const searchTerm = args.app.toLowerCase();
          
          // Search in /System/Applications (built-in macOS apps)
          try {
            const { stdout: systemApps } = await execAsync('find /System/Applications -name "*.app" -maxdepth 1 | while read app; do basename "$app" .app; done');
            const systemAppsList = systemApps.trim().split('\n').filter(app => app.length > 0);
            
            for (const app of systemAppsList) {
              try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "/System/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                
                if (displayName.toLowerCase().includes(searchTerm) || searchTerm.includes(displayName.toLowerCase())) {
                  actualAppName = displayName; // For display
                  systemAppName = app; // For opening (use system name)
                  break;
                }
              } catch (e) {
                // Continue to next app
              }
            }
          } catch (e) {
            // Continue to /Applications
          }
          
          // Search in /Applications if not found
          if (actualAppName === args.app) {
            try {
                const { stdout: userApps } = await execAsync('find /Applications -name "*.app" -maxdepth 1 | while read app; do basename "$app" .app; done');
              const userAppsList = userApps.trim().split('\n').filter(app => app.length > 0);
              
              for (const app of userAppsList) {
                try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                  
                  if (displayName.toLowerCase().includes(searchTerm) || searchTerm.includes(displayName.toLowerCase())) {
                    actualAppName = displayName; // For display
                    systemAppName = app; // For opening (use system name)
                    break;
                  }
                } catch (e) {
                  // Continue to next app
                }
              }
            } catch (e) {
              // Continue to ~/Applications
            }
          }
          
          // Search in ~/Applications if not found
          if (actualAppName === args.app) {
            try {
                const { stdout: homeApps } = await execAsync('find ~/Applications -name "*.app" -maxdepth 1 2>/dev/null | while read app; do basename "$app" .app; done');
              const homeAppsList = homeApps.trim().split('\n').filter(app => app.length > 0);
              
              for (const app of homeAppsList) {
                try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "$HOME/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                  
                  if (displayName.toLowerCase().includes(searchTerm) || searchTerm.includes(displayName.toLowerCase())) {
                    actualAppName = displayName; // For display
                    systemAppName = app; // For opening (use system name)
                    break;
                  }
                } catch (e) {
                  // Continue to next app
                }
              }
            } catch (e) {
              // Use original name as fallback
            }
          }

          // Try to open the application using open command
          const openScript = `
            try
              do shell script "open -a ${systemAppName}"
              return "SUCCESS"
            on error errMsg
              return "ERROR:" & errMsg
            end try
          `;
          
          const result = await runAppleScript(openScript);
          
          if (result.startsWith("ERROR:")) {
            throw new Error(result.substring(6));
          }
          
          return {
            content: [
              {
                type: "text",
                text: `✅ Opened ${actualAppName}`,
              },
            ],
          };
        } catch (error) {
          // Handle specific error codes
          if (error.message.includes("-1728")) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Application "${args.app}" not found. Please check the application name and try again.`,
                },
              ],
            };
          }
          throw error;
        }
      }

      case "quit_app": {
        try {
          await runAppleScript(`tell application "${args.app}" to quit`);
          return {
            content: [
              {
                type: "text",
                text: `✅ Quit ${args.app}`,
              },
            ],
          };
        } catch (error) {
          if (error.message.includes("-1728")) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Application "${args.app}" not found or not running.`,
                },
              ],
            };
          }
          throw error;
        }
      }

      case "focus_mode": {
        const action = args.enabled ? "on" : "off";
        // Note: This requires System Events access
        await execAsync(
          `shortcuts run "Set Focus" --input '{"enabled": ${args.enabled}}'`
        ).catch(() => {
          // Fallback: Try using defaults command
          return execAsync(
            `defaults -currentHost write ~/Library/Preferences/ByHost/com.apple.notificationcenterui doNotDisturb -boolean ${args.enabled}`
          );
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ Focus mode ${args.enabled ? 'enabled' : 'disabled'}`,
            },
          ],
        };
      }

      case "get_running_apps": {
        const script = 'tell application "System Events" to get name of every process whose background only is false';
        const result = await runAppleScript(script);
        const apps = result.split(", ").join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Running applications:\n\n${apps}`,
            },
          ],
        };
      }

      case "get_installed_apps": {
        try {
          const allApps = [];
          
          // Get apps from /System/Applications (built-in macOS apps)
          try {
            const { stdout: systemApps } = await execAsync('find /System/Applications -name "*.app" -maxdepth 1 | while read app; do basename "$app" .app; done');
            const systemAppsList = systemApps.trim().split('\n').filter(app => app.length > 0);
            
            // Get localized names using mdls
            for (const app of systemAppsList) {
              try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "/System/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                allApps.push(displayName);
              } catch (e) {
                allApps.push(app);
              }
            }
          } catch (e) {
            // Fallback if mdls fails
          }
          
          // Get apps from /Applications
          try {
                const { stdout: userApps } = await execAsync('find /Applications -name "*.app" -maxdepth 1 | while read app; do basename "$app" .app; done');
            const userAppsList = userApps.trim().split('\n').filter(app => app.length > 0);
            
            // Get localized names using mdls
            for (const app of userAppsList) {
              try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                allApps.push(displayName);
              } catch (e) {
                allApps.push(app);
              }
            }
          } catch (e) {
            // Fallback if mdls fails
          }
          
          // Get apps from ~/Applications
          try {
                const { stdout: homeApps } = await execAsync('find ~/Applications -name "*.app" -maxdepth 1 2>/dev/null | while read app; do basename "$app" .app; done');
            const homeAppsList = homeApps.trim().split('\n').filter(app => app.length > 0);
            
            // Get localized names using mdls
            for (const app of homeAppsList) {
              try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "$HOME/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                allApps.push(displayName);
              } catch (e) {
                allApps.push(app);
              }
            }
          } catch (e) {
            // Fallback if mdls fails
          }
          
          const sortedApps = [...new Set(allApps)].sort();
          
          return {
            content: [
              {
                type: "text",
                text: `Installed applications (${sortedApps.length} total):\n\n${sortedApps.join('\n')}`,
              },
            ],
          };
        } catch (error) {
          // Fallback to shell command if AppleScript fails
          try {
            const { stdout: systemApps } = await execAsync('ls /Applications | grep ".app" | sed "s/.app$//"');
            const systemAppsList = systemApps.trim().split('\n').filter(app => app.length > 0);
            
            const { stdout: userApps } = await execAsync('ls ~/Applications 2>/dev/null | grep ".app" | sed "s/.app$//" || echo ""');
            const userAppsList = userApps.trim().split('\n').filter(app => app.length > 0);
            
            const allApps = [...new Set([...systemAppsList, ...userAppsList])].sort();
            
            return {
              content: [
                {
                  type: "text",
                  text: `Installed applications (${allApps.length} total):\n\n${allApps.join('\n')}`,
                },
              ],
            };
          } catch (fallbackError) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Error getting installed apps: ${error.message}`,
                },
              ],
            };
          }
        }
      }

      case "get_app_icon_mapping": {
        try {
          const mapping = {};
          
          // Get apps from /System/Applications (built-in macOS apps)
          try {
            const { stdout: systemApps } = await execAsync('find /System/Applications -name "*.app" -maxdepth 1 | while read app; do basename "$app" .app; done');
            const systemAppsList = systemApps.trim().split('\n').filter(app => app.length > 0);
            
            // Get localized names using mdls
            for (const app of systemAppsList) {
              try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "/System/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                mapping[displayName] = app; // localized name -> system name
              } catch (e) {
                mapping[app] = app; // fallback
              }
            }
          } catch (e) {
            // Continue
          }
          
          // Get apps from /Applications
          try {
                const { stdout: userApps } = await execAsync('find /Applications -name "*.app" -maxdepth 1 | while read app; do basename "$app" .app; done');
            const userAppsList = userApps.trim().split('\n').filter(app => app.length > 0);
            
            // Get localized names using mdls
            for (const app of userAppsList) {
              try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                mapping[displayName] = app; // localized name -> system name
              } catch (e) {
                mapping[app] = app; // fallback
              }
            }
          } catch (e) {
            // Continue
          }
          
          // Get apps from ~/Applications
          try {
                const { stdout: homeApps } = await execAsync('find ~/Applications -name "*.app" -maxdepth 1 2>/dev/null | while read app; do basename "$app" .app; done');
            const homeAppsList = homeApps.trim().split('\n').filter(app => app.length > 0);
            
            // Get localized names using mdls
            for (const app of homeAppsList) {
              try {
                const { stdout: mdlsResult } = await execAsync(`mdls -name kMDItemDisplayName "$HOME/Applications/${app}.app" 2>/dev/null`);
                const match = mdlsResult.match(/kMDItemDisplayName = "([^"]+)"/);
                const displayName = match ? match[1] : app;
                mapping[displayName] = app; // localized name -> system name
              } catch (e) {
                mapping[app] = app; // fallback
              }
            }
          } catch (e) {
            // Continue
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(mapping, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error getting app icon mapping: ${error.message}`,
              },
            ],
          };
        }
      }

      case "run_shell_command": {
        const { stdout, stderr } = await execAsync(args.command);
        return {
          content: [
            {
              type: "text",
              text: stdout || stderr || "Command executed",
            },
          ],
        };
      }

      case "set_volume": {
        await runAppleScript(`set volume output volume ${args.volume}`);
        return {
          content: [
            {
              type: "text",
              text: `✅ Volume set to ${args.volume}%`,
            },
          ],
        };
      }

      case "get_clipboard": {
        const { stdout } = await execAsync("pbpaste");
        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      }

      case "set_clipboard": {
        await execAsync(`echo "${args.text.replace(/"/g, '\\"')}" | pbcopy`);
        return {
          content: [
            {
              type: "text",
              text: "✅ Copied to clipboard",
            },
          ],
        };
      }

      case "take_screenshot": {
        const os = await import('os');
        let path = args.path || "~/Desktop/screenshot.png";
        
        // Expand ~ to home directory
        if (path.startsWith('~')) {
          path = path.replace('~', os.homedir());
        }
        
        const mode = args.interactive ? "-i" : "";
        
        try {
          await execAsync(`screencapture ${mode} "${path}"`);
          
          // Verify the file was created
          const fs = await import('fs');
          if (fs.existsSync(path)) {
            return {
              content: [
                {
                  type: "text",
                  text: `✅ Screenshot saved to ${path}`,
                },
              ],
            };
          } else {
            throw new Error("Screenshot file was not created");
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to take screenshot: ${error.message}`,
              },
            ],
          };
        }
      }

      case "show_notification": {
        try {
          // Escape quotes in message and title
          const safeMessage = args.message.replace(/"/g, '\\"');
          const safeTitle = args.title.replace(/"/g, '\\"');
          
          const script = `display notification "${safeMessage}" with title "${safeTitle}"`;
          await runAppleScript(script);
          
          return {
            content: [
              {
                type: "text",
                text: "✅ Notification sent",
              },
            ],
          };
        } catch (error) {
          // Try alternative method using osascript directly
          try {
            await execAsync(`osascript -e 'display notification "${args.message}" with title "${args.title}"'`);
            return {
              content: [
                {
                  type: "text",
                  text: "✅ Notification sent (alternative method)",
                },
              ],
            };
          } catch (altError) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Failed to show notification: ${error.message}\nAlternative method also failed: ${altError.message}`,
                },
              ],
            };
          }
        }
      }

      case "get_system_info": {
        let info = "";
        
        if (!args.type || args.type === "all" || args.type === "hardware") {
          const hwInfo = await execAsync("system_profiler SPHardwareDataType");
          info += "=== HARDWARE ===\n" + hwInfo.stdout + "\n";
        }
        
        if (!args.type || args.type === "all" || args.type === "software") {
          const osInfo = await execAsync("sw_vers");
          const uptime = await execAsync("uptime");
          info += "=== SOFTWARE ===\n" + osInfo.stdout + "\nUptime: " + uptime.stdout + "\n";
        }
        
        if (!args.type || args.type === "all" || args.type === "network") {
          const netInfo = await execAsync("ifconfig | grep 'inet ' | grep -v 127.0.0.1");
          info += "=== NETWORK ===\n" + netInfo.stdout + "\n";
        }
        
        if (!args.type || args.type === "all" || args.type === "storage") {
          const diskInfo = await execAsync("df -h");
          info += "=== STORAGE ===\n" + diskInfo.stdout;
        }
        
        return {
          content: [
            {
              type: "text",
              text: info,
            },
          ],
        };
      }

      case "empty_trash": {
        if (args.secure) {
          await runAppleScript('tell application "Finder" to empty trash with security');
        } else {
          await runAppleScript('tell application "Finder" to empty trash');
        }
        
        return {
          content: [
            {
              type: "text",
              text: "🗑️ Trash emptied" + (args.secure ? " (securely)" : ""),
            },
          ],
        };
      }

      case "lock_screen": {
        await execAsync("pmset displaysleepnow");
        return {
          content: [
            {
              type: "text",
              text: "🔒 Screen locked",
            },
          ],
        };
      }

      case "sleep_display": {
        await execAsync("pmset displaysleepnow");
        return {
          content: [
            {
              type: "text",
              text: "💤 Display sleeping",
            },
          ],
        };
      }

      case "restart_computer": {
        const delay = args.delay || 60;
        // Run in background to avoid timeout
        runAppleScript(`
          tell application "System Events"
            display dialog "Computer will restart in ${delay} seconds" buttons {"Cancel", "Restart Now"} default button 2 giving up after ${delay}
            if button returned of result is "Restart Now" then
              restart
            end if
          end tell
        `).catch(() => {
          // Ignore errors for background operation
        });
        
        return {
          content: [
            {
              type: "text",
              text: `🔄 Restart dialog shown (${delay}s delay)`,
            },
          ],
        };
      }

      case "shutdown_computer": {
        const delay = args.delay || 60;
        // Run in background to avoid timeout
        runAppleScript(`
          tell application "System Events"
            display dialog "Computer will shutdown in ${delay} seconds" buttons {"Cancel", "Shutdown Now"} default button 2 giving up after ${delay}
            if button returned of result is "Shutdown Now" then
              shut down
            end if
          end tell
        `).catch(() => {
          // Ignore errors for background operation
        });
        
        return {
          content: [
            {
              type: "text",
              text: `🔌 Shutdown dialog shown (${delay}s delay)`,
            },
          ],
        };
      }

      case "toggle_wifi": {
        const action = args.enabled ? "on" : "off";
        await execAsync(`networksetup -setairportpower en0 ${action}`);
        
        return {
          content: [
            {
              type: "text",
              text: `📶 WiFi turned ${action}`,
            },
          ],
        };
      }

      case "toggle_bluetooth": {
        const action = args.enabled ? "on" : "off";
        try {
          // Try blueutil first (if installed)
          await execAsync(`blueutil -p ${args.enabled ? "1" : "0"}`);
          return {
            content: [
              {
                type: "text",
                text: `🔵 Bluetooth turned ${action}`,
              },
            ],
          };
        } catch (error) {
          // Fallback: Use system command
          try {
            await execAsync(`sudo pkill bluetoothd && sudo launchctl load /System/Library/LaunchDaemons/com.apple.bluetoothd.plist`);
            return {
              content: [
                {
                  type: "text",
                  text: `🔵 Bluetooth ${action} (system method)`,
                },
              ],
            };
          } catch (fallbackError) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Bluetooth toggle failed: ${error.message}. Install blueutil for better control.`,
                },
              ],
            };
          }
        }
      }

      case "get_battery_status": {
        const { stdout } = await execAsync("pmset -g batt");
        const batteryInfo = stdout.trim();
        
        return {
          content: [
            {
              type: "text",
              text: `🔋 Battery Status:\n${batteryInfo}`,
            },
          ],
        };
      }

      case "get_wifi_info": {
        try {
          const wifiIface = await getWifiInterface();

          // Get network interface info
          const { stdout: ifconfig } = await execAsync(`ifconfig ${wifiIface}`);

          let ssid = "Not connected";
          let status = "Disconnected";
          let ipAddress = "No IP address";

          // Check if interface is active
          const isActive = ifconfig.includes("status: active");

          // Resolve SSID using modern macOS sources. The legacy `airport -I` and
          // `networksetup -getairportnetwork` no longer expose the SSID on
          // macOS 14+ (Sonoma/Sequoia), so we prefer `ipconfig getsummary`.
          ssid = (await getWifiSsid(wifiIface)) ?? "Not connected";

          // If we have an SSID or the interface is active, we're connected
          if (ssid !== "Not connected" || isActive) {
            status = "Connected";

            // Active interface but no SSID resolved => hidden SSID or non-WiFi link
            if (ssid === "Not connected" && isActive) {
              ssid = "Connected (non-WiFi or hidden SSID)";
            }
          }
          
          // Extract IP address
          const ipMatch = ifconfig.match(/inet (\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) {
            ipAddress = ipMatch[1];
            // If we have an IP, we're definitely connected
            if (status === "Disconnected") {
              status = "Connected";
            }
          }
          
          // Get internet connectivity
          let internetStatus = "Checking...";
          try {
            await execAsync("ping -c 1 -t 2 8.8.8.8");
            internetStatus = "✅ Internet access confirmed";
          } catch {
            try {
              // Try DNS as backup
              await execAsync("nslookup google.com");
              internetStatus = "✅ Internet access (DNS working)";
            } catch {
              internetStatus = "❌ No internet connection";
            }
          }
          
          // Get additional network info
          let connectionType = "WiFi";
          if (ssid === "Connected (non-WiFi or hidden SSID)" || ssid === "Not connected") {
            // Check if using Ethernet
            try {
              const { stdout: enInfo } = await execAsync("ifconfig | grep -A 4 'en[0-9]:' | grep 'status: active'");
              if (enInfo && !ssid.includes("WiFi")) {
                connectionType = "Ethernet or other";
              }
            } catch {}
          }
          
          return {
            content: [
              {
                type: "text",
                text: `📶 Network Status:\n\n` +
                      `Connection Type: ${connectionType}\n` +
                      `Network Name: ${ssid}\n` +
                      `Status: ${status}\n` +
                      `IP Address: ${ipAddress}\n` +
                      `Internet: ${internetStatus}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error getting network info: ${error.message}\n\nTry running: networksetup -getairportnetwork en0`,
              },
            ],
            isError: true,
          };
        }
      }

      case "toggle_dark_mode": {
        const script = args.enabled !== undefined
          ? `tell application "System Events" to tell appearance preferences to set dark mode to ${args.enabled}`
          : `tell application "System Events" to tell appearance preferences to set dark mode to not dark mode`;
        
        await runAppleScript(script);
        
        return {
          content: [
            {
              type: "text",
              text: `🌓 Dark mode ${args.enabled !== undefined ? (args.enabled ? 'enabled' : 'disabled') : 'toggled'}`,
            },
          ],
        };
      }

      case "mail_search": {
        try {
          const limit = args.limit || 10;
          const script = `
            tell application "Mail"
              set searchResults to {}
              set searchTerm to "${args.query.replace(/"/g, '\\"')}"
              
              try
                -- Search in all mailboxes
                set allMessages to messages of every mailbox
                set messageCount to 0
                
                repeat with mb in mailboxes
                  try
                    set mbMessages to messages of mb
                    repeat with msg in mbMessages
                      if messageCount >= ${limit} then exit repeat
                      
                      try
                        set msgSubject to subject of msg
                        set msgSender to sender of msg
                        set msgDate to date sent of msg
                        set msgRead to read status of msg
                        
                        -- Check if message matches search
                        if msgSubject contains searchTerm or msgSender contains searchTerm then
                          set messageInfo to "Subject: " & msgSubject & "\\nFrom: " & msgSender & "\\nDate: " & (msgDate as string) & "\\nRead: " & msgRead & "\\n---"
                          set searchResults to searchResults & {messageInfo}
                          set messageCount to messageCount + 1
                        end if
                      on error
                        -- Skip problematic messages
                      end try
                    end repeat
                  on error
                    -- Skip problematic mailboxes
                  end try
                end repeat
                
                return "SUCCESS:" & (count of searchResults)
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result.startsWith("SUCCESS:")) {
            const count = parseInt(result.split(":")[1]);
            return {
              content: [
                {
                  type: "text",
                  text: `📧 Found ${count} emails matching "${args.query}"`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Mail search error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Mail search failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "mail_unread": {
        try {
          const limit = args.limit || 10;
          const script = `
            tell application "Mail"
              set unreadMessages to messages of inbox whose read status is false
              set resultText to ""
              set messageCount to 0
              
              repeat with msg in unreadMessages
                if messageCount >= ${limit} then exit repeat
                
                try
                  set msgSubject to subject of msg
                  set msgSender to sender of msg
                  set msgDate to date sent of msg
                  
                  set resultText to resultText & "Subject: " & msgSubject & "\\nFrom: " & msgSender & "\\nDate: " & (msgDate as string) & "\\n---\\n"
                  set messageCount to messageCount + 1
                on error
                  -- Skip problematic messages
                end try
              end repeat
              
              return "SUCCESS:" & messageCount & "\\n" & resultText
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result.startsWith("SUCCESS:")) {
            const lines = result.split("\n");
            const count = parseInt(lines[0].split(":")[1]);
            const emailDetails = lines.slice(1).join("\n").trim();
            
            let responseText = `📧 ${count} unread emails`;
            
            if (count > 0 && emailDetails) {
              responseText += `\n\n${emailDetails}`;
              responseText += `\n\nDo you want to read the email content?`;
            }
            
            return {
              content: [
                {
                  type: "text",
                  text: responseText,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Mail error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Mail unread failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "mail_read": {
        try {
          const unreadOnly = args.unread_only !== false;
          let script;
          
          if (args.index) {
            // Read by index (1-based)
            const index = args.index - 1; // Convert to 0-based
            script = `
              tell application "Mail"
                set targetMessages to messages of inbox whose read status is ${unreadOnly ? 'false' : 'true or false'}
                if (count of targetMessages) > ${index} then
                  set targetMsg to item ${index + 1} of targetMessages
                  set msgSubject to subject of targetMsg
                  set msgSender to sender of targetMsg
                  set msgDate to date sent of targetMsg
                  set msgContent to content of targetMsg
                  
                  return "SUCCESS:" & msgSubject & "|" & msgSender & "|" & (msgDate as string) & "|" & msgContent
                else
                  return "ERROR:Email index out of range"
                end if
              end tell
            `;
          } else if (args.subject) {
            // Read by subject (partial match)
            script = `
              tell application "Mail"
                set targetMessages to messages of inbox whose read status is ${unreadOnly ? 'false' : 'true or false'}
                repeat with msg in targetMessages
                  set msgSubject to subject of msg
                  if msgSubject contains "${args.subject.replace(/"/g, '\\"')}" then
                    set msgSender to sender of msg
                    set msgDate to date sent of msg
                    set msgContent to content of msg
                    
                    return "SUCCESS:" & msgSubject & "|" & msgSender & "|" & (msgDate as string) & "|" & msgContent
                  end if
                end repeat
                return "ERROR:No email found with subject containing '${args.subject.replace(/"/g, '\\"')}'"
              end tell
            `;
          } else {
            // Read first unread email
            script = `
              tell application "Mail"
                set unreadMessages to messages of inbox whose read status is false
                if (count of unreadMessages) > 0 then
                  set targetMsg to item 1 of unreadMessages
                  set msgSubject to subject of targetMsg
                  set msgSender to sender of targetMsg
                  set msgDate to date sent of targetMsg
                  set msgContent to content of targetMsg
                  
                  return "SUCCESS:" & msgSubject & "|" & msgSender & "|" & (msgDate as string) & "|" & msgContent
                else
                  return "ERROR:No unread emails found"
                end if
              end tell
            `;
          }
          
          const result = await runAppleScript(script);
          
          if (result.startsWith("SUCCESS:")) {
            const parts = result.substring(8).split("|");
            const subject = parts[0];
            const sender = parts[1];
            const date = parts[2];
            const content = parts.slice(3).join("|");
            
            return {
              content: [
                {
                  type: "text",
                  text: `📧 Email Content:\n\nSubject: ${subject}\nFrom: ${sender}\nDate: ${date}\n\nContent:\n${content}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ ${result.substring(6)}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error reading email: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "mail_send": {
        try {
          const script = `
            tell application "Mail"
              try
                set newMessage to make new outgoing message with properties {subject:"${args.subject.replace(/"/g, '\\"')}", content:"${args.body.replace(/"/g, '\\"')}"}
                tell newMessage
                  make new to recipient with properties {address:"${args.to}"}
                  ${args.cc ? `make new cc recipient with properties {address:"${args.cc}"}` : ''}
                end tell
                send newMessage
                return "SUCCESS"
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result === "SUCCESS") {
            return {
              content: [
                {
                  type: "text",
                  text: `📧 Email sent to ${args.to}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Mail send error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Mail send failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "maps_search": {
        try {
          const script = `
            tell application "Maps"
              try
                set searchQuery to "${args.query.replace(/"/g, '\\"')}"
                open location searchQuery
                return "SUCCESS:Opened Maps with search for " & searchQuery
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result.startsWith("SUCCESS:")) {
            return {
              content: [
                {
                  type: "text",
                  text: `🗺️ Opened Maps with search for "${args.query}"`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Maps search error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Maps search failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "maps_directions": {
        try {
          const from = args.from || "current location";
          const transport = args.transport || "driving";
          
          const script = `
            tell application "Maps"
              try
                set fromLocation to "${from.replace(/"/g, '\\"')}"
                set toLocation to "${args.to.replace(/"/g, '\\"')}"
                set transportType to "${transport}"
                
                -- Open Maps with directions
                open location "http://maps.apple.com/?saddr=" & fromLocation & "&daddr=" & toLocation & "&dirflg=" & transportType
                return "SUCCESS:Directions from " & fromLocation & " to " & toLocation
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result.startsWith("SUCCESS:")) {
            return {
              content: [
                {
                  type: "text",
                  text: `🗺️ Getting directions from ${from} to ${args.to} (${transport})`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Maps directions error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Maps directions failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "calendar_events": {
        try {
          const days = args.days || 7;
          const script = `
            tell application "Calendar"
              try
                set eventList to {}
                set currentDate to current date
                set endDate to currentDate + (${days} * days)

                -- Get events from all calendars
                repeat with cal in calendars
                  try
                    set calEvents to (every event of cal whose start date is greater than or equal to currentDate and start date is less than or equal to endDate)
                    repeat with evt in calEvents
                      try
                        set eventTitle to summary of evt
                        set eventStart to start date of evt
                        set eventEnd to end date of evt
                        set eventLoc to ""
                        try
                          set eventLoc to location of evt
                        end try

                        -- Format: "TITLE|START|END|LOCATION"
                        set eventInfo to eventTitle & "|" & (eventStart as string) & "|" & (eventEnd as string) & "|" & eventLoc
                        set eventList to eventList & {eventInfo}
                      on error
                        -- Skip problematic events
                      end try
                    end repeat
                  on error
                    -- Skip problematic calendars
                  end try
                end repeat

                -- Join with newline separator
                set AppleScript's text item delimiters to "\\n"
                set eventListText to eventList as string
                set AppleScript's text item delimiters to ""

                return "SUCCESS:" & (count of eventList) & "\\n" & eventListText
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;

          const result = await runAppleScript(script);

          if (result.startsWith("SUCCESS:")) {
            const lines = result.split('\n');
            const countLine = lines[0].split(':')[1];
            const count = parseInt(countLine);

            if (count === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: `📅 No calendar events in the next ${days} days`,
                  },
                ],
              };
            }

            // Parse events
            const events = [];
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim()) {
                const parts = lines[i].split('|');
                if (parts.length >= 3) {
                  events.push({
                    title: parts[0],
                    start: parts[1],
                    end: parts[2],
                    location: parts[3] || ''
                  });
                }
              }
            }

            // Format output
            let output = `📅 Found ${count} calendar event${count > 1 ? 's' : ''} in the next ${days} days:\n\n`;
            events.forEach((evt, idx) => {
              output += `${idx + 1}. ${evt.title}\n`;
              output += `   📆 ${evt.start}\n`;
              if (evt.location) {
                output += `   📍 ${evt.location}\n`;
              }
              output += '\n';
            });

            return {
              content: [
                {
                  type: "text",
                  text: output.trim(),
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Calendar error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Calendar events failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "calendar_create": {
        try {
          // Parse the date strings to ensure correct format
          // Expected format from LLM: "YYYY-MM-DD HH:MM"
          // AppleScript needs: "date \"Sunday, October 15, 2025 at 10:00:00 AM\""

          const parseDate = (dateStr) => {
            // Parse "2025-10-15 10:00" or "2025-10-15 10:00:00"
            const parts = dateStr.trim().split(' ');
            const dateParts = parts[0].split('-');
            const timeParts = parts[1] ? parts[1].split(':') : ['12', '00'];

            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
            const day = parseInt(dateParts[2]);
            const hour = parseInt(timeParts[0]);
            const minute = parseInt(timeParts[1]);

            return new Date(year, month, day, hour, minute);
          };

          const startDate = parseDate(args.start);
          const endDate = parseDate(args.end);

          // Format for AppleScript: "day/month/year hour:minute:second" (DD/MM/YYYY for Polish locale)
          const formatForAppleScript = (date) => {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            const second = String(date.getSeconds()).padStart(2, '0');
            return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
          };

          const startFormatted = formatForAppleScript(startDate);
          const endFormatted = formatForAppleScript(endDate);

          const script = `
            tell application "Calendar"
              try
                set startDate to date "${startFormatted}"
                set endDate to date "${endFormatted}"
                set newEvent to make new event at end of events of calendar 1 with properties {summary:"${args.title.replace(/"/g, '\\"')}", start date:startDate, end date:endDate}
                ${args.location ? `set location of newEvent to "${args.location.replace(/"/g, '\\"')}"` : ''}
                ${args.notes ? `set description of newEvent to "${args.notes.replace(/"/g, '\\"')}"` : ''}
                return "SUCCESS"
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;

          const result = await runAppleScript(script);

          if (result === "SUCCESS") {
            // Format a nice display message for the user
            const formatForDisplay = (date) => {
              const day = String(date.getDate()).padStart(2, '0');
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const year = date.getFullYear();
              const hour = String(date.getHours()).padStart(2, '0');
              const minute = String(date.getMinutes()).padStart(2, '0');
              return `${day}/${month}/${year} at ${hour}:${minute}`;
            };

            return {
              content: [
                {
                  type: "text",
                  text: `📅 Created calendar event: "${args.title}" on ${formatForDisplay(startDate)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Calendar create error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Calendar create failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "messages_send": {
        try {
          const script = `
            tell application "Messages"
              try
                set targetService to 1st service whose service type = iMessage
                set targetBuddy to participant "${args.to}" of targetService
                send "${args.message.replace(/"/g, '\\"')}" to targetBuddy
                return "SUCCESS"
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result === "SUCCESS") {
            return {
              content: [
                {
                  type: "text",
                  text: `💬 Message sent to ${args.to}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Messages send error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Messages send failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "reminders_list": {
        try {
          const includeCompleted = args.completed || false;
          const script = `
            tell application "Reminders"
              try
                set reminderList to {}
                repeat with rem in reminders
                  try
                    set isCompleted to completed of rem
                    if ${includeCompleted} or not isCompleted then
                      set reminderInfo to "Title: " & name of rem & "\\nCompleted: " & isCompleted & "\\n---"
                      set reminderList to reminderList & {reminderInfo}
                    end if
                  on error
                    -- Skip problematic reminders
                  end try
                end repeat
                
                return "SUCCESS:" & (count of reminderList)
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result.startsWith("SUCCESS:")) {
            const count = parseInt(result.split(":")[1]);
            return {
              content: [
                {
                  type: "text",
                  text: `📝 Found ${count} reminders`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Reminders error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Reminders list failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "reminders_create": {
        try {
          const script = `
            tell application "Reminders"
              try
                set newReminder to make new reminder with properties {name:"${args.title.replace(/"/g, '\\"')}"}
                ${args.due ? `set due date of newReminder to date "${args.due}"` : ''}
                ${args.notes ? `set body of newReminder to "${args.notes.replace(/"/g, '\\"')}"` : ''}
                return "SUCCESS"
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result === "SUCCESS") {
            return {
              content: [
                {
                  type: "text",
                  text: `📝 Created reminder: "${args.title}"`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Reminders create error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Reminders create failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "notes_list": {
        try {
          const limit = args.limit || 10;
          const script = `
            tell application "Notes"
              try
                set output to ""
                set noteCount to 0
                
                repeat with aNote in notes
                  if noteCount >= ${limit} then exit repeat
                  
                  try
                    set noteTitle to name of aNote
                    set noteBody to body of aNote as string
                    set output to output & "### " & noteTitle & "\\n" & noteBody & "\\n\\n"
                    set noteCount to noteCount + 1
                  on error
                    -- Skip problematic notes
                  end try
                end repeat
                
                if noteCount = 0 then
                  return "EMPTY"
                else
                  return "SUCCESS:" & noteCount & "\\n" & output
                end if
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result === "EMPTY") {
            return {
              content: [{ type: "text", text: `📝 No notes found` }],
            };
          } else if (result.startsWith("SUCCESS:")) {
            const newlineIdx = result.indexOf("\n");
            const count = parseInt(result.substring(8, newlineIdx));
            const notesText = result.substring(newlineIdx + 1);
            return {
              content: [
                {
                  type: "text",
                  text: `📝 Found ${count} notes:\n\n${notesText}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Notes error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Notes list failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "notes_create": {
        try {
          const script = `
            tell application "Notes"
              try
                set newNote to make new note with properties {name:"${args.title.replace(/"/g, '\\"')}", body:"${args.content.replace(/"/g, '\\"')}"}
                return "SUCCESS"
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result === "SUCCESS") {
            return {
              content: [
                {
                  type: "text",
                  text: `📝 Created note: "${args.title}"`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Notes create error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Notes create failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "contacts_search": {
        try {
          const script = `
            tell application "Contacts"
              try
                set contactList to {}
                set searchTerm to "${args.query.replace(/"/g, '\\"')}"
                
                repeat with aPerson in people
                  try
                    set personName to name of aPerson
                    if personName contains searchTerm then
                      set contactInfo to "Name: " & personName & "\\n---"
                      set contactList to contactList & {contactInfo}
                    end if
                  on error
                    -- Skip problematic contacts
                  end try
                end repeat
                
                return "SUCCESS:" & (count of contactList)
              on error errMsg
                return "ERROR:" & errMsg
              end try
            end tell
          `;
          
          const result = await runAppleScript(script);
          
          if (result.startsWith("SUCCESS:")) {
            const count = parseInt(result.split(":")[1]);
            return {
              content: [
                {
                  type: "text",
                  text: `👤 Found ${count} contacts matching "${args.query}"`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Contacts error: ${result}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Contacts search failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "get_current_time": {
        try {
          const now = new Date();
          const timeString = now.toLocaleString('pl-PL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Europe/Warsaw'
          });
          
          return {
            content: [
              {
                type: "text",
                text: `🕐 Current time: ${timeString}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to get current time: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "get_current_date": {
        try {
          const now = new Date();
          const dateString = now.toLocaleDateString('pl-PL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'Europe/Warsaw'
          });
          
          return {
            content: [
              {
                type: "text",
                text: `📅 Today is: ${dateString}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to get current date: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "window_manage": {
        const layouts = {
          maximize: "set position of win to {0, topInset}\n    set size of win to {sw, uh}",
          left: "set position of win to {0, topInset}\n    set size of win to {sw div 2, uh}",
          right: "set position of win to {sw div 2, topInset}\n    set size of win to {sw div 2, uh}",
          center:
            "set w to (sw * 3) div 5\n    set h to (uh * 7) div 10\n    set position of win to {(sw - w) div 2, topInset + ((uh - h) div 2)}\n    set size of win to {w, h}",
        };
        const layout = layouts[args.action];
        if (!layout) throw new Error(`Unknown window action: ${args.action}`);

        await runAppleScript(`
          tell application "Finder" to set b to bounds of window of desktop
          set sw to item 3 of b
          set sh to item 4 of b
          set topInset to 25
          set uh to sh - topInset
          tell application "System Events"
            set frontApp to first application process whose frontmost is true
            set win to front window of frontApp
            ${layout}
          end tell
        `);

        return {
          content: [{ type: "text", text: `🪟 Window: ${args.action}` }],
        };
      }

      case "set_brightness": {
        const steps = Math.max(1, Math.min(20, args.steps ?? 4));
        const keyCode = args.direction === "down" ? 145 : 144;
        await runAppleScript(`
          tell application "System Events"
            repeat ${steps} times
              key code ${keyCode}
            end repeat
          end tell
        `);

        return {
          content: [
            {
              type: "text",
              text: `🔆 Brightness ${args.direction} (${steps} steps)`,
            },
          ],
        };
      }

      case "type_text": {
        const escaped = String(args.text).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        await runAppleScript(`tell application "System Events" to keystroke "${escaped}"`);

        return {
          content: [{ type: "text", text: `⌨️ Typed: ${args.text}` }],
        };
      }

      case "wifi_scan": {
        let preferred = "";
        try {
          const { stdout } = await execAsync("networksetup -listpreferredwirelessnetworks en0");
          preferred = stdout
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("Preferred networks"))
            .map((l) => `• ${l}`)
            .join("\n");
        } catch {}

        let available = "";
        try {
          const { stdout } = await execAsync("system_profiler SPAirPortDataType");
          const block = stdout.split("Other Local Wi-Fi Networks:")[1];
          if (block) {
            available = block
              .split("\n")
              .map((l) => l.match(/^\s{12}(.+?):\s*$/))
              .filter(Boolean)
              .map((m) => `• ${m[1].trim()}`)
              .join("\n");
          }
        } catch {}

        return {
          content: [
            {
              type: "text",
              text:
                `📶 WiFi networks\n\n` +
                `Available nearby:\n${available || "(scan unavailable)"}\n\n` +
                `Preferred (saved):\n${preferred || "(none)"}`,
            },
          ],
        };
      }

      case "wifi_connect": {
        const ssid = String(args.ssid).replace(/'/g, "'\\''");
        const pass = args.password ? ` '${String(args.password).replace(/'/g, "'\\''")}'` : "";
        const { stdout } = await execAsync(`networksetup -setairportnetwork en0 '${ssid}'${pass}`);
        const failed = stdout.trim();

        return {
          content: [
            {
              type: "text",
              text: failed
                ? `❌ ${failed}`
                : `📶 Connected to "${args.ssid}"`,
            },
          ],
          isError: Boolean(failed),
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("moonOS Automation MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
