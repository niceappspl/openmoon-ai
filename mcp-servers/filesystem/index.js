#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const server = new Server(
  {
    name: "moonos-filesystem-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to expand ~ to home directory
async function expandPath(inputPath) {
  if (inputPath && inputPath.startsWith('~')) {
    const os = await import('os');
    return inputPath.replace('~', os.homedir());
  }
  return inputPath;
}

// Tool definitions
const TOOLS = [
  {
    name: "read_file",
    description: "Read contents of a file at given path",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to file",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file (creates or overwrites)",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to file",
        },
        content: {
          type: "string",
          description: "Content to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and folders in a directory",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path (default: current directory)",
        },
      },
    },
  },
  {
    name: "search_files",
    description: "Search for files by name or content using grep/find",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (filename or content)",
        },
        path: {
          type: "string",
          description: "Directory to search in",
        },
        type: {
          type: "string",
          enum: ["name", "content"],
          description: "Search by filename or file content",
        },
      },
      required: ["query", "type"],
    },
  },
  {
    name: "get_file_info",
    description: "Get metadata about a file (size, modified date, etc)",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to file or directory",
        },
      },
      required: ["path"],
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
      case "read_file": {
        const filePath = await expandPath(args.path);
        const content = await fs.readFile(filePath, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      }

      case "write_file": {
        const filePath = await expandPath(args.path);
        await fs.writeFile(filePath, args.content, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `✅ File written successfully to ${filePath}`,
            },
          ],
        };
      }

      case "list_directory": {
        let dirPath = await expandPath(args.path || process.cwd());
        
        try {
          const files = await fs.readdir(dirPath, { withFileTypes: true });
          const fileList = files
            .map((f) => `${f.isDirectory() ? "📁" : "📄"} ${f.name}`)
            .join("\n");
          return {
            content: [
              {
                type: "text",
                text: `Directory: ${dirPath}\n\n${fileList}`,
              },
            ],
          };
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
      }

      case "search_files": {
        const searchPath = await expandPath(args.path || process.cwd());
        let result;

        if (args.type === "name") {
          // Search by filename
          const { stdout } = await execAsync(
            `find "${searchPath}" -name "*${args.query}*" -type f 2>/dev/null | head -20`
          );
          result = stdout.trim() || "No files found";
        } else {
          // Search by content
          const { stdout } = await execAsync(
            `grep -r "${args.query}" "${searchPath}" 2>/dev/null | head -20`
          );
          result = stdout.trim() || "No matches found";
        }

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "get_file_info": {
        const filePath = await expandPath(args.path);
        const stats = await fs.stat(filePath);
        const info = {
          path: args.path,
          size: `${(stats.size / 1024).toFixed(2)} KB`,
          modified: stats.mtime.toISOString(),
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
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
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("moonOS Filesystem MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
