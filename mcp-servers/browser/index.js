#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

const server = new Server(
  {
    name: "moonos-browser-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to run AppleScript
async function runAppleScript(script) {
  const { stdout, stderr } = await execAsync(`osascript -e '${script.replace(/'/g, "\\'")}'`);
  if (stderr) throw new Error(stderr);
  return stdout.trim();
}

// Tool definitions
const TOOLS = [
  {
    name: "open_url",
    description: "Open URL in default browser or specific browser",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to open",
        },
        browser: {
          type: "string",
          enum: ["default", "Safari", "Google Chrome", "Firefox", "Microsoft Edge"],
          description: "Browser to use (default: system default)",
        },
        incognito: {
          type: "boolean",
          description: "Open in incognito/private mode",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "search_web",
    description: "Search the web using default search engine",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        engine: {
          type: "string",
          enum: ["google", "bing", "duckduckgo", "github", "stackoverflow"],
          description: "Search engine to use",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_active_tab_info",
    description: "Get URL and title of active browser tab",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to check",
        },
      },
      required: ["browser"],
    },
  },
  {
    name: "close_tab",
    description: "Close current tab in browser",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to target",
        },
      },
      required: ["browser"],
    },
  },
  {
    name: "bookmark_current_page",
    description: "Bookmark the current page",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to use",
        },
        folder: {
          type: "string",
          description: "Bookmark folder name",
        },
      },
      required: ["browser"],
    },
  },
  {
    name: "save_page_as_pdf",
    description: "Save current page as PDF",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to use",
        },
        path: {
          type: "string",
          description: "Path to save PDF (default: Downloads)",
        },
      },
      required: ["browser"],
    },
  },
  {
    name: "list_open_tabs",
    description: "List all open tabs in browser",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to check",
        },
      },
      required: ["browser"],
    },
  },
  {
    name: "reload_tab",
    description: "Reload current tab",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to use",
        },
        hard_reload: {
          type: "boolean",
          description: "Force reload ignoring cache",
        },
      },
      required: ["browser"],
    },
  },
  {
    name: "go_back",
    description: "Navigate back in browser history",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to use",
        },
      },
      required: ["browser"],
    },
  },
  {
    name: "go_forward",
    description: "Navigate forward in browser history",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to use",
        },
      },
      required: ["browser"],
    },
  },
  {
    name: "clear_browsing_data",
    description: "Clear browsing data (history, cookies, cache)",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["Safari", "Google Chrome"],
          description: "Browser to clear",
        },
        data_types: {
          type: "array",
          items: {
            type: "string",
            enum: ["history", "cookies", "cache", "downloads"],
          },
          description: "Types of data to clear",
        },
      },
      required: ["browser", "data_types"],
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
      case "open_url": {
        let url = args.url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        if (args.browser && args.browser !== "default") {
          if (args.incognito) {
            // Browser-specific incognito commands
            if (args.browser === "Google Chrome") {
              await execAsync(`open -a "Google Chrome" --args --incognito "${url}"`);
            } else if (args.browser === "Safari") {
              // Safari doesn't have direct incognito flag, use AppleScript
              await runAppleScript(`
                tell application "Safari"
                  activate
                  make new document
                  set URL of current tab of front window to "${url}"
                end tell
              `);
            }
          } else {
            await execAsync(`open -a "${args.browser}" "${url}"`);
          }
        } else {
          await execAsync(`open "${url}"`);
        }

        return {
          content: [
            {
              type: "text",
              text: `🌐 Opened ${url}${args.browser ? ` in ${args.browser}` : ''}${args.incognito ? ' (incognito)' : ''}`,
            },
          ],
        };
      }

      case "search_web": {
        const engines = {
          google: "https://www.google.com/search?q=",
          bing: "https://www.bing.com/search?q=",
          duckduckgo: "https://duckduckgo.com/?q=",
          github: "https://github.com/search?q=",
          stackoverflow: "https://stackoverflow.com/search?q=",
        };

        const engine = args.engine || "google";
        const searchUrl = engines[engine] + encodeURIComponent(args.query);
        
        await execAsync(`open "${searchUrl}"`);

        return {
          content: [
            {
              type: "text",
              text: `🔍 Searching for "${args.query}" on ${engine}`,
            },
          ],
        };
      }

      case "get_active_tab_info": {
        let script;
        if (args.browser === "Safari") {
          script = `
            tell application "Safari"
              set tabUrl to URL of current tab of front window
              set tabTitle to name of current tab of front window
              return tabUrl & "|" & tabTitle
            end tell
          `;
        } else if (args.browser === "Google Chrome") {
          script = `
            tell application "Google Chrome"
              set tabUrl to URL of active tab of front window
              set tabTitle to title of active tab of front window
              return tabUrl & "|" & tabTitle
            end tell
          `;
        }

        const result = await runAppleScript(script);
        const [url, title] = result.split('|');

        return {
          content: [
            {
              type: "text",
              text: `📑 Active tab:\nTitle: ${title}\nURL: ${url}`,
            },
          ],
        };
      }

      case "close_tab": {
        const script = args.browser === "Safari" 
          ? `tell application "Safari" to close current tab of front window`
          : `tell application "Google Chrome" to close active tab of front window`;
        
        await runAppleScript(script);

        return {
          content: [
            {
              type: "text",
              text: `❌ Closed tab in ${args.browser}`,
            },
          ],
        };
      }

      case "list_open_tabs": {
        let script;
        if (args.browser === "Safari") {
          script = `
            tell application "Safari"
              set tabList to ""
              repeat with w in windows
                repeat with t in tabs of w
                  set tabList to tabList & name of t & " - " & URL of t & "\\n"
                end repeat
              end repeat
              return tabList
            end tell
          `;
        } else {
          script = `
            tell application "Google Chrome"
              set tabList to ""
              repeat with w in windows
                repeat with t in tabs of w
                  set tabList to tabList & title of t & " - " & URL of t & "\\n"
                end repeat
              end repeat
              return tabList
            end tell
          `;
        }

        const tabs = await runAppleScript(script);

        return {
          content: [
            {
              type: "text",
              text: `📑 Open tabs in ${args.browser}:\n${tabs}`,
            },
          ],
        };
      }

      case "reload_tab": {
        const script = args.browser === "Safari"
          ? `tell application "Safari" to do JavaScript "location.reload(${args.hard_reload ? 'true' : 'false'})" in current tab of front window`
          : `tell application "Google Chrome" to reload active tab of front window`;
        
        await runAppleScript(script);

        return {
          content: [
            {
              type: "text",
              text: `🔄 Reloaded tab in ${args.browser}${args.hard_reload ? ' (hard reload)' : ''}`,
            },
          ],
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
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Browser MCP Server running on stdio");
}

main();
