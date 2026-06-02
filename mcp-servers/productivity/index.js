#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const server = new Server(
  {
    name: "moonos-productivity-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Storage paths
const STORAGE_DIR = path.join(os.homedir(), '.moonos', 'productivity');
const TASKS_FILE = path.join(STORAGE_DIR, 'tasks.json');
const NOTES_DIR = path.join(STORAGE_DIR, 'notes');
const POMODORO_FILE = path.join(STORAGE_DIR, 'pomodoro.json');

// Initialize storage
async function initStorage() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    await fs.mkdir(NOTES_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating storage directories:', error);
  }
}

// Tool definitions
const TOOLS = [
  {
    name: "create_task",
    description: "Create a new task with optional due date and priority",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title",
        },
        description: {
          type: "string",
          description: "Task description (optional)",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Task priority",
        },
        due_date: {
          type: "string",
          description: "Due date in YYYY-MM-DD format (optional)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description: "List all tasks with optional filtering",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "completed", "all"],
          description: "Filter by status",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Filter by priority",
        },
        tag: {
          type: "string",
          description: "Filter by tag",
        },
      },
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Task ID to complete",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "delete_task",
    description: "Delete a task",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Task ID to delete",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "create_note",
    description: "Create a new note with markdown support",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note title",
        },
        content: {
          type: "string",
          description: "Note content (supports markdown)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "search_notes",
    description: "Search notes by title, content, or tags",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        tag: {
          type: "string",
          description: "Filter by specific tag",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "start_pomodoro",
    description: "Start a Pomodoro timer session",
    inputSchema: {
      type: "object",
      properties: {
        duration: {
          type: "number",
          description: "Duration in minutes (default: 25)",
        },
        task: {
          type: "string",
          description: "What you're working on",
        },
      },
    },
  },
  {
    name: "start_break",
    description: "Start a break timer",
    inputSchema: {
      type: "object",
      properties: {
        duration: {
          type: "number",
          description: "Duration in minutes (default: 5 for short, 15 for long)",
        },
        type: {
          type: "string",
          enum: ["short", "long"],
          description: "Type of break",
        },
      },
    },
  },
  {
    name: "get_pomodoro_stats",
    description: "Get Pomodoro statistics for today",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_reminder",
    description: "Create a time-based reminder",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Reminder message",
        },
        time: {
          type: "string",
          description: "Time in HH:MM format or 'in X minutes'",
        },
        recurring: {
          type: "boolean",
          description: "Make it recurring daily",
        },
      },
      required: ["message", "time"],
    },
  },
  {
    name: "track_habit",
    description: "Track a daily habit",
    inputSchema: {
      type: "object",
      properties: {
        habit: {
          type: "string",
          description: "Habit name",
        },
        completed: {
          type: "boolean",
          description: "Mark as completed for today",
        },
      },
      required: ["habit", "completed"],
    },
  },
  {
    name: "get_habit_streak",
    description: "Get streak information for a habit",
    inputSchema: {
      type: "object",
      properties: {
        habit: {
          type: "string",
          description: "Habit name",
        },
      },
      required: ["habit"],
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
      case "create_task": {
        await initStorage();
        const tasks = await loadTasks();
        const newTask = {
          id: Date.now().toString(),
          title: args.title,
          description: args.description || "",
          priority: args.priority || "medium",
          due_date: args.due_date || null,
          tags: args.tags || [],
          status: "pending",
          created_at: new Date().toISOString(),
          completed_at: null,
        };
        tasks.push(newTask);
        await saveTasks(tasks);
        
        return {
          content: [
            {
              type: "text",
              text: `✅ Task created: "${newTask.title}" (ID: ${newTask.id})`,
            },
          ],
        };
      }

      case "list_tasks": {
        const tasks = await loadTasks();
        let filtered = tasks;
        
        if (args.status && args.status !== "all") {
          filtered = filtered.filter(t => t.status === args.status);
        }
        if (args.priority) {
          filtered = filtered.filter(t => t.priority === args.priority);
        }
        if (args.tag) {
          filtered = filtered.filter(t => t.tags.includes(args.tag));
        }
        
        const taskList = filtered.map(t => 
          `${t.status === 'completed' ? '✓' : '○'} [${t.priority.toUpperCase()}] ${t.title} (ID: ${t.id})${t.due_date ? ` - Due: ${t.due_date}` : ''}`
        ).join('\n');
        
        return {
          content: [
            {
              type: "text",
              text: taskList || "No tasks found",
            },
          ],
        };
      }

      case "complete_task": {
        const tasks = await loadTasks();
        const task = tasks.find(t => t.id === args.task_id);
        
        if (!task) {
          throw new Error(`Task ${args.task_id} not found`);
        }
        
        task.status = "completed";
        task.completed_at = new Date().toISOString();
        await saveTasks(tasks);
        
        return {
          content: [
            {
              type: "text",
              text: `✅ Task completed: "${task.title}"`,
            },
          ],
        };
      }

      case "create_note": {
        await initStorage();
        const noteId = Date.now().toString();
        const noteFile = path.join(NOTES_DIR, `${noteId}.md`);
        const noteContent = `# ${args.title}\n\nTags: ${(args.tags || []).join(', ')}\nCreated: ${new Date().toISOString()}\n\n---\n\n${args.content}`;
        
        await fs.writeFile(noteFile, noteContent);
        
        return {
          content: [
            {
              type: "text",
              text: `📝 Note created: "${args.title}"`,
            },
          ],
        };
      }

      case "start_pomodoro": {
        await initStorage();
        const duration = args.duration || 25;
        const session = {
          type: "pomodoro",
          duration: duration,
          task: args.task || "Focus session",
          started_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + duration * 60 * 1000).toISOString(),
        };
        
        await fs.writeFile(POMODORO_FILE, JSON.stringify(session, null, 2));
        
        return {
          content: [
            {
              type: "text",
              text: `🍅 Pomodoro started: ${duration} minutes\nTask: ${session.task}\nEnds at: ${new Date(session.ends_at).toLocaleTimeString()}`,
            },
          ],
        };
      }

      case "get_pomodoro_stats": {
        try {
          await initStorage();
          const today = new Date().toDateString();
          let stats = {
            today: 0,
            total: 0,
            current_session: null,
            completed_today: []
          };

          // Check if there's a current session
          try {
            const sessionData = await fs.readFile(POMODORO_FILE, 'utf8');
            const session = JSON.parse(sessionData);
            stats.current_session = session;
          } catch (error) {
            // No current session
          }

          // For now, return basic stats
          // In a real implementation, you'd track completed sessions
          return {
            content: [
              {
                type: "text",
                text: `🍅 Pomodoro Stats:\n\nToday: ${stats.today} completed\nTotal: ${stats.total} completed\n\n${stats.current_session ? `Current: ${stats.current_session.task} (${stats.current_session.duration}min)\nEnds: ${new Date(stats.current_session.ends_at).toLocaleTimeString()}` : 'No active session'}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Error getting stats: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "delete_task": {
        const tasks = await loadTasks();
        const taskIndex = tasks.findIndex(t => t.id === args.task_id);
        
        if (taskIndex === -1) {
          throw new Error(`Task ${args.task_id} not found`);
        }
        
        const deletedTask = tasks.splice(taskIndex, 1)[0];
        await saveTasks(tasks);
        
        return {
          content: [
            {
              type: "text",
              text: `🗑️ Task deleted: "${deletedTask.title}"`,
            },
          ],
        };
      }

      case "search_notes": {
        await initStorage();
        const files = await fs.readdir(NOTES_DIR);
        const matchingNotes = [];
        
        for (const file of files) {
          if (file.endsWith('.md')) {
            const content = await fs.readFile(path.join(NOTES_DIR, file), 'utf8');
            if (content.toLowerCase().includes(args.query.toLowerCase())) {
              const lines = content.split('\n');
              const title = lines[0].replace('# ', '');
              matchingNotes.push(`📝 ${title} (${file})`);
            }
          }
        }
        
        return {
          content: [
            {
              type: "text",
              text: matchingNotes.length > 0 ? matchingNotes.join('\n') : 'No notes found',
            },
          ],
        };
      }

      case "start_break": {
        await initStorage();
        const duration = args.duration || (args.type === 'long' ? 15 : 5);
        const session = {
          type: "break",
          duration: duration,
          break_type: args.type || "short",
          started_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + duration * 60 * 1000).toISOString(),
        };
        
        await fs.writeFile(POMODORO_FILE, JSON.stringify(session, null, 2));
        
        return {
          content: [
            {
              type: "text",
              text: `☕ Break started: ${duration} minutes (${session.break_type})\nEnds at: ${new Date(session.ends_at).toLocaleTimeString()}`,
            },
          ],
        };
      }

      case "create_reminder": {
        await initStorage();
        const reminderId = Date.now().toString();
        const reminder = {
          id: reminderId,
          message: args.message,
          time: args.time,
          recurring: args.recurring || false,
          created_at: new Date().toISOString(),
        };
        
        // For now, just save to a simple file
        // In a real implementation, you'd integrate with system reminders
        const reminderFile = path.join(STORAGE_DIR, 'reminders.json');
        let reminders = [];
        try {
          const data = await fs.readFile(reminderFile, 'utf8');
          reminders = JSON.parse(data);
        } catch (error) {
          // File doesn't exist yet
        }
        
        reminders.push(reminder);
        await fs.writeFile(reminderFile, JSON.stringify(reminders, null, 2));
        
        return {
          content: [
            {
              type: "text",
              text: `⏰ Reminder created: "${args.message}" at ${args.time}`,
            },
          ],
        };
      }

      case "track_habit": {
        await initStorage();
        const habitFile = path.join(STORAGE_DIR, 'habits.json');
        let habits = {};
        
        try {
          const data = await fs.readFile(habitFile, 'utf8');
          habits = JSON.parse(data);
        } catch (error) {
          // File doesn't exist yet
        }
        
        const today = new Date().toDateString();
        if (!habits[args.habit]) {
          habits[args.habit] = { streak: 0, last_completed: null, history: [] };
        }
        
        if (args.completed) {
          habits[args.habit].last_completed = today;
          habits[args.habit].history.push(today);
          habits[args.habit].streak += 1;
        }
        
        await fs.writeFile(habitFile, JSON.stringify(habits, null, 2));
        
        return {
          content: [
            {
              type: "text",
              text: `✅ Habit tracked: "${args.habit}" - ${args.completed ? 'Completed' : 'Not completed'} today\nStreak: ${habits[args.habit].streak} days`,
            },
          ],
        };
      }

      case "get_habit_streak": {
        await initStorage();
        const habitFile = path.join(STORAGE_DIR, 'habits.json');
        let habits = {};
        
        try {
          const data = await fs.readFile(habitFile, 'utf8');
          habits = JSON.parse(data);
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ No habits found`,
              },
            ],
          };
        }
        
        const habit = habits[args.habit];
        if (!habit) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Habit "${args.habit}" not found`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: `📊 Habit: "${args.habit}"\nStreak: ${habit.streak} days\nLast completed: ${habit.last_completed || 'Never'}`,
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

// Helper functions
async function loadTasks() {
  try {
    const data = await fs.readFile(TASKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveTasks(tasks) {
  await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Productivity MCP Server running on stdio");
}

main();
