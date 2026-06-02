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

const server = new Server(
  {
    name: "moonos-media-mcp",
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
    name: "play_pause_media",
    description: "Play or pause current media",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          enum: ["system", "Spotify", "Music", "YouTube"],
          description: "Media app to control (default: system)",
        },
      },
    },
  },
  {
    name: "next_track",
    description: "Skip to next track",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          enum: ["system", "Spotify", "Music"],
          description: "Media app to control",
        },
      },
    },
  },
  {
    name: "previous_track",
    description: "Go to previous track",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          enum: ["system", "Spotify", "Music"],
          description: "Media app to control",
        },
      },
    },
  },
  {
    name: "get_current_track",
    description: "Get information about currently playing track",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          enum: ["Spotify", "Music"],
          description: "Media app to check",
        },
      },
      required: ["app"],
    },
  },
  {
    name: "set_media_volume",
    description: "Set volume for media player",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          enum: ["Spotify", "Music"],
          description: "Media app to control",
        },
        volume: {
          type: "number",
          description: "Volume level (0-100)",
          minimum: 0,
          maximum: 100,
        },
      },
      required: ["app", "volume"],
    },
  },
  {
    name: "search_and_play",
    description: "Search for a song/artist and play",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Song, artist, or album to search for",
        },
        app: {
          type: "string",
          enum: ["Spotify", "Music"],
          description: "App to search in",
        },
        type: {
          type: "string",
          enum: ["track", "artist", "album", "playlist"],
          description: "Type of search",
        },
      },
      required: ["query", "app"],
    },
  },
  {
    name: "create_playlist",
    description: "Create a new playlist",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Playlist name",
        },
        app: {
          type: "string",
          enum: ["Spotify", "Music"],
          description: "App to create playlist in",
        },
      },
      required: ["name", "app"],
    },
  },
  {
    name: "add_to_playlist",
    description: "Add current track to a playlist",
    inputSchema: {
      type: "object",
      properties: {
        playlist: {
          type: "string",
          description: "Playlist name",
        },
        app: {
          type: "string",
          enum: ["Spotify", "Music"],
          description: "Media app",
        },
      },
      required: ["playlist", "app"],
    },
  },
  {
    name: "toggle_shuffle",
    description: "Toggle shuffle mode",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          enum: ["Spotify", "Music"],
          description: "Media app",
        },
        enabled: {
          type: "boolean",
          description: "Enable or disable shuffle",
        },
      },
      required: ["app"],
    },
  },
  {
    name: "toggle_repeat",
    description: "Toggle repeat mode",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          enum: ["Spotify", "Music"],
          description: "Media app",
        },
        mode: {
          type: "string",
          enum: ["off", "one", "all"],
          description: "Repeat mode",
        },
      },
      required: ["app"],
    },
  },
  {
    name: "capture_screenshot",
    description: "Take a screenshot with options",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["fullscreen", "window", "selection"],
          description: "Type of screenshot",
        },
        path: {
          type: "string",
          description: "Path to save (default: Desktop)",
        },
        delay: {
          type: "number",
          description: "Delay in seconds before capture",
        },
      },
    },
  },
  {
    name: "record_screen",
    description: "Start/stop screen recording",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["start", "stop"],
          description: "Start or stop recording",
        },
        audio: {
          type: "boolean",
          description: "Include audio in recording",
        },
        path: {
          type: "string",
          description: "Path to save recording",
        },
      },
      required: ["action"],
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

  // DEBUG: Log ALL tool calls to file
  const fs = await import('fs');
  const logMsg = `[${new Date().toISOString()}] Tool called: ${name}, Args: ${JSON.stringify(args)}\n`;
  fs.default.appendFileSync('/tmp/moonos/media_debug.log', logMsg);

  console.error(`[MEDIA SERVER] Tool called: ${name}`);
  console.error(`[MEDIA SERVER] Arguments:`, JSON.stringify(args));

  try {
    switch (name) {
      case "play_pause_media": {
        if (args.app === "Spotify") {
          await runAppleScript('tell application "Spotify" to playpause');
        } else if (args.app === "Music") {
          await runAppleScript('tell application "Music" to playpause');
        } else {
          // System-wide play/pause
          await execAsync("osascript -e 'tell application \"System Events\" to key code 16'");
        }
        
        return {
          content: [
            {
              type: "text",
              text: `⏯️ Toggled play/pause${args.app ? ` in ${args.app}` : ''}`,
            },
          ],
        };
      }

      case "next_track": {
        if (args.app === "Spotify") {
          await runAppleScript('tell application "Spotify" to next track');
        } else if (args.app === "Music") {
          await runAppleScript('tell application "Music" to next track');
        } else {
          await execAsync("osascript -e 'tell application \"System Events\" to key code 17'");
        }
        
        return {
          content: [
            {
              type: "text",
              text: `⏭️ Skipped to next track`,
            },
          ],
        };
      }

      case "previous_track": {
        if (args.app === "Spotify") {
          await runAppleScript('tell application "Spotify" to previous track');
        } else if (args.app === "Music") {
          await runAppleScript('tell application "Music" to previous track');
        } else {
          await execAsync("osascript -e 'tell application \"System Events\" to key code 18'");
        }
        
        return {
          content: [
            {
              type: "text",
              text: `⏮️ Went to previous track`,
            },
          ],
        };
      }

      case "get_current_track": {
        let trackInfo;
        
        if (args.app === "Spotify") {
          const script = `
            tell application "Spotify"
              if player state is playing then
                set trackName to name of current track
                set artistName to artist of current track
                set albumName to album of current track
                set trackDuration to duration of current track
                set trackPosition to player position
                return trackName & "|" & artistName & "|" & albumName & "|" & trackDuration & "|" & trackPosition
              else
                return "Not playing"
              end if
            end tell
          `;
          trackInfo = await runAppleScript(script);
        } else if (args.app === "Music") {
          const script = `
            tell application "Music"
              if player state is playing then
                set trackName to name of current track
                set artistName to artist of current track
                set albumName to album of current track
                set trackDuration to duration of current track
                set trackPosition to player position
                return trackName & "|" & artistName & "|" & albumName & "|" & trackDuration & "|" & trackPosition
              else
                return "Not playing"
              end if
            end tell
          `;
          trackInfo = await runAppleScript(script);
        }

        if (trackInfo === "Not playing") {
          return {
            content: [
              {
                type: "text",
                text: "🔇 No track currently playing",
              },
            ],
          };
        }

        const [name, artist, album, duration, position] = trackInfo.split('|');
        const durationMin = Math.floor(duration / 60000);
        const durationSec = Math.floor((duration % 60000) / 1000);
        const positionMin = Math.floor(position / 60);
        const positionSec = Math.floor(position % 60);

        return {
          content: [
            {
              type: "text",
              text: `🎵 Now Playing:\n🎤 ${name}\n👤 ${artist}\n💿 ${album}\n⏱️ ${positionMin}:${positionSec.toString().padStart(2, '0')} / ${durationMin}:${durationSec.toString().padStart(2, '0')}`,
            },
          ],
        };
      }

      case "set_media_volume": {
        if (args.app === "Spotify") {
          await runAppleScript(`tell application "Spotify" to set sound volume to ${args.volume}`);
        } else if (args.app === "Music") {
          await runAppleScript(`tell application "Music" to set sound volume to ${args.volume}`);
        }
        
        return {
          content: [
            {
              type: "text",
              text: `🔊 Set ${args.app} volume to ${args.volume}%`,
            },
          ],
        };
      }

      case "search_and_play": {
        // DEBUG LOG
        console.error(`[MEDIA] search_and_play called with query="${args.query}", app="${args.app}"`);

        if (args.app === "Spotify") {
          // Known tracks database (hardcoded Spotify URIs for popular songs)
          const knownTracks = {
            // AC/DC
            'back in black': 'spotify:track:08mG3Y1vljYA6bvDt4Wqkj',
            'ac/dc': 'spotify:track:08mG3Y1vljYA6bvDt4Wqkj',
            'highway to hell': 'spotify:track:2zYzyRzz6pRmhPzyfMEC8s',

            // Metallica
            'metallica': 'spotify:track:1hKdDCpiI9mqz1jVHRKG0E',
            'enter sandman': 'spotify:track:1hKdDCpiI9mqz1jVHRKG0E',
            'nothing else matters': 'spotify:track:4VgI6fRiXNPKV4bCIy9w5D',
            'master of puppets': 'spotify:track:1ZRdJNrbHIDivOdKSKhSKj',

            // Queen
            'queen': 'spotify:track:4u7EnebtmKWzUH433cf5Qv',
            'bohemian rhapsody': 'spotify:track:4u7EnebtmKWzUH433cf5Qv',
            'we will rock you': 'spotify:track:4pbJqGIASGPr0ZpGpnWkDn',

            // The Beatles
            'beatles': 'spotify:track:5jgFfDIR6FR0gvlA56Nakr',
            'hey jude': 'spotify:track:0aym2LBJBk9DAYuHHutrIl',
            'let it be': 'spotify:track:7iN1s7xHE4ifF5povM6A48',

            // Led Zeppelin
            'led zeppelin': 'spotify:track:2RlgNHKcydI9sayD2Df2xp',
            'stairway to heaven': 'spotify:track:5CQ30WqJwcep0pYcV4AMNc',

            // Pink Floyd
            'pink floyd': 'spotify:track:3TO7bbrUKrOSPGRTB5MeCz',
            'comfortably numb': 'spotify:track:5HNCy40Ni5BZJFw1TKzRsC',
          };

          // Check if we have a known track
          const queryLower = args.query.toLowerCase();
          let trackUri = null;

          for (const [key, uri] of Object.entries(knownTracks)) {
            if (queryLower.includes(key)) {
              trackUri = uri;
              break;
            }
          }

          if (trackUri) {
            // Play known track directly using AppleScript
            console.error(`[MEDIA] Found known track, URI: ${trackUri}`);
            try {
              const script = `tell application "Spotify" to play track "${trackUri}"`;
              const result = await runAppleScript(script);
              console.error(`[MEDIA] Executed AppleScript: ${script}`);
              console.error(`[MEDIA] Result:`, result);

              return {
                content: [
                  {
                    type: "text",
                    text: `🎵 Playing "${args.query}" on Spotify`,
                  },
                ],
              };
            } catch (error) {
              console.error(`[MEDIA] Error playing track:`, error);
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to play track: ${error.message}`,
                  },
                ],
                isError: true,
              };
            }
          } else {
            // Unknown track - open search
            console.error(`[MEDIA] Unknown track, opening search for: ${args.query}`);
            try {
              await execAsync(`open "spotify:search:${args.query.replace(/"/g, '\\"')}"`);
              console.error(`[MEDIA] Opened search successfully`);

              return {
                content: [
                  {
                    type: "text",
                    text: `🔍 Opened Spotify search for "${args.query}"\n\n💡 Click on a result to play it.`,
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to open Spotify: ${error.message}`,
                  },
                ],
                isError: true,
              };
            }
          }
        } else if (args.app === "Music") {
          // For Apple Music, use AppleScript to search
          const script = `
            tell application "Music"
              activate
              set searchResults to search playlist "Library" for "${args.query.replace(/"/g, '\\"')}"
              if (count of searchResults) > 0 then
                play (item 1 of searchResults)
                return "Playing: " & name of (item 1 of searchResults)
              else
                return "No results found"
              end if
            end tell
          `;

          const result = await runAppleScript(script);

          return {
            content: [
              {
                type: "text",
                text: `🎵 ${result}`,
              },
            ],
          };
        }

        throw new Error("Unsupported app");
      }

      case "create_playlist": {
        // Note: Creating playlists requires more complex integration
        return {
          content: [
            {
              type: "text",
              text: `⚠️ Playlist creation not yet implemented for ${args.app}. Please create manually.`,
            },
          ],
        };
      }

      case "add_to_playlist": {
        // Note: Adding to playlists requires more complex integration
        return {
          content: [
            {
              type: "text",
              text: `⚠️ Adding to playlist not yet implemented for ${args.app}. Please add manually.`,
            },
          ],
        };
      }

      case "toggle_shuffle": {
        if (args.app === "Spotify") {
          const enabled = args.enabled !== undefined ? args.enabled :
            await runAppleScript('tell application "Spotify" to return shuffling') === "false";
          await runAppleScript(`tell application "Spotify" to set shuffling to ${enabled}`);
        } else if (args.app === "Music") {
          const enabled = args.enabled !== undefined ? args.enabled :
            await runAppleScript('tell application "Music" to return shuffle enabled') === "false";
          await runAppleScript(`tell application "Music" to set shuffle enabled to ${enabled}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `🔀 Shuffle ${args.enabled ? 'enabled' : 'toggled'} in ${args.app}`,
            },
          ],
        };
      }

      case "toggle_repeat": {
        if (args.app === "Spotify") {
          const mode = args.mode || "all";
          let repeatValue;
          switch (mode) {
            case "off":
              repeatValue = "false";
              break;
            case "one":
              repeatValue = "true";
              await runAppleScript('tell application "Spotify" to set repeating to true');
              await runAppleScript('tell application "Spotify" to set repeating to one');
              return {
                content: [
                  {
                    type: "text",
                    text: `🔂 Repeat one track enabled in ${args.app}`,
                  },
                ],
              };
            case "all":
            default:
              repeatValue = "true";
          }
          await runAppleScript(`tell application "Spotify" to set repeating to ${repeatValue}`);
        } else if (args.app === "Music") {
          const mode = args.mode || "all";
          let repeatMode;
          switch (mode) {
            case "off":
              repeatMode = "off";
              break;
            case "one":
              repeatMode = "one";
              break;
            case "all":
            default:
              repeatMode = "all";
          }
          await runAppleScript(`tell application "Music" to set song repeat to ${repeatMode}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `🔁 Repeat mode set to ${args.mode || 'all'} in ${args.app}`,
            },
          ],
        };
      }

      case "capture_screenshot": {
        const delay = args.delay || 0;
        const path = args.path || "~/Desktop/Screenshot.png";
        let command;

        switch (args.type) {
          case "fullscreen":
            command = `screencapture ${delay ? `-T ${delay}` : ''} "${path}"`;
            break;
          case "window":
            command = `screencapture ${delay ? `-T ${delay}` : ''} -w "${path}"`;
            break;
          case "selection":
            command = `screencapture ${delay ? `-T ${delay}` : ''} -s "${path}"`;
            break;
          default:
            command = `screencapture "${path}"`;
        }

        await execAsync(command);

        return {
          content: [
            {
              type: "text",
              text: `📸 Screenshot saved${args.type ? ` (${args.type})` : ''}`,
            },
          ],
        };
      }

      case "record_screen": {
        if (args.action === "start") {
          return {
            content: [
              {
                type: "text",
                text: `⚠️ Screen recording requires manual setup. Please use:\n• QuickTime Player: File → New Screen Recording\n• macOS built-in: Cmd+Shift+5`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `⚠️ Stop recording manually using the control bar or Cmd+Control+Esc`,
              },
            ],
          };
        }
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
  console.error("Media MCP Server running on stdio");
}

main();
