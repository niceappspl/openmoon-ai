// Test Commands Library for openMOON
// Comprehensive list of test commands for all 92 MCP tools

import { LucideIcon } from 'lucide-react';
import {
  // Messages & Communication
  MessageSquare, Send, Search, Users, Mail, Inbox,
  // Notes & Docs
  FileText, Clipboard, FolderOpen, File, Edit,
  // Calendar & Time
  Calendar, Bell, Clock, Timer,
  // Maps & Location
  MapPin, Navigation, Coffee, UtensilsCrossed,
  // File System
  Folder, HardDrive, Download,
  // System Control
  Terminal, Power, Wifi, Bluetooth, Monitor, Lock, Volume2, Settings,
  Zap, Eye, EyeOff, Trash2, RefreshCw,
  // Media
  Music, Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Image, Video,
  // Browser
  Globe, Bookmark, ChevronRight, ChevronLeft, X as CloseIcon,
  // Productivity
  CheckSquare, ListTodo, Activity, TrendingUp, Lightbulb,
  // Misc
  Copy as CopyIcon, User
} from 'lucide-react';

export interface TestCommand {
  category: string;
  command: string;
  description: string;
  icon: LucideIcon;
}

export const TEST_COMMANDS: TestCommand[] = [
  // ============ MESSAGES (4 commands) ============
  {
    category: 'Messages',
    command: 'send message to John saying "Meeting at 3pm"',
    description: 'Send iMessage',
    icon: Send
  },
  {
    category: 'Messages',
    command: 'read my recent messages',
    description: 'View recent texts',
    icon: MessageSquare
  },
  {
    category: 'Messages',
    command: 'search messages from Sarah',
    description: 'Search message history',
    icon: Search
  },
  {
    category: 'Messages',
    command: 'send message to Mom saying "Good morning"',
    description: 'Send message',
    icon: Clock
  },

  // ============ NOTES (4 commands) ============
  {
    category: 'Notes',
    command: 'Create a note called "Meeting Notes" with bullet points',
    description: 'Create new note',
    icon: FileText
  },
  {
    category: 'Notes',
    command: 'Search notes for "budget"',
    description: 'Search notes',
    icon: Search
  },
  {
    category: 'Notes',
    command: 'List all my notes',
    description: 'View all notes',
    icon: Clipboard
  },
  {
    category: 'Notes',
    command: 'Show my note folders',
    description: 'List folders',
    icon: FolderOpen
  },

  // ============ CALENDAR (4 commands) ============
  {
    category: 'Calendar',
    command: 'show my calendar events',
    description: 'List upcoming events',
    icon: Calendar
  },
  {
    category: 'Calendar',
    command: 'create calendar event: Team Sync on: ',
    description: 'Create new event',
    icon: Calendar
  },
  {
    category: 'Calendar',
    command: 'what is my schedule for tomorrow',
    description: 'Check tomorrow events',
    icon: Clock
  },
  {
    category: 'Calendar',
    command: 'schedule meeting: Project review on: ',
    description: 'Schedule meeting',
    icon: Users
  },

  // ============ REMINDERS (5 commands) ============
  {
    category: 'Reminders',
    command: 'Remind me to call John on: ',
    description: 'Create reminder',
    icon: Bell
  },
  {
    category: 'Reminders',
    command: 'Show all my reminders',
    description: 'List reminders',
    icon: Bell
  },
  {
    category: 'Reminders',
    command: 'Search reminders for "groceries"',
    description: 'Find reminders',
    icon: Search
  },
  {
    category: 'Reminders',
    command: 'Complete reminder about dentist',
    description: 'Mark as done',
    icon: CheckSquare
  },
  {
    category: 'Reminders',
    command: 'Show reminders in Shopping list',
    description: 'List by category',
    icon: ListTodo
  },

  // ============ CONTACTS (3 commands) ============
  {
    category: 'Contacts',
    command: 'Find contact John Smith',
    description: 'Search contacts',
    icon: Search
  },
  {
    category: 'Contacts',
    command: 'Show contact info for Mom',
    description: 'Get contact details',
    icon: Users
  },
  {
    category: 'Contacts',
    command: 'List all my contacts',
    description: 'View all contacts',
    icon: Users
  },

  // ============ MAIL (3 commands) ============
  {
    category: 'Mail',
    command: 'Read my recent emails',
    description: 'Check inbox',
    icon: Inbox
  },
  {
    category: 'Mail',
    command: 'check unread emails',
    description: 'Check for new emails',
    icon: Mail
  },
  {
    category: 'Mail',
    command: 'search emails for invoice',
    description: 'Find emails',
    icon: Search
  },
  {
    category: 'Mail',
    command: 'send email to john@example.com subject: Meeting confirmed body: Meeting is confirmed on: ',
    description: 'Send email',
    icon: Send
  },
  {
    category: 'Mail',
    command: 'find emails from boss',
    description: 'Search emails by sender',
    icon: User
  },


  // ============ MAPS (4 commands) ============
  {
    category: 'Maps',
    command: 'search for coffee shops with Maps',
    description: 'Find nearby coffee shops',
    icon: Coffee
  },
  {
    category: 'Maps',
    command: 'get directions from home to work with Maps',
    description: 'Navigate between locations',
    icon: Navigation
  },
  {
    category: 'Maps',
    command: 'search for parks in Poznań with Maps',
    description: 'Search specific places',
    icon: UtensilsCrossed
  },
  {
    category: 'Maps',
    command: 'get directions to Stary Browar Poznań with Maps',
    description: 'Navigate to specific location',
    icon: MapPin
  },

  // ============ FILE SYSTEM (5 commands) ============
  {
    category: 'Files',
    command: 'Read file ~/Documents/notes.txt',
    description: 'Read file contents',
    icon: File
  },
  {
    category: 'Files',
    command: 'Write "Hello World" to ~/Desktop/test.txt',
    description: 'Write to file',
    icon: Edit
  },
  {
    category: 'Files',
    command: 'List files in ~/Documents',
    description: 'List directory',
    icon: Folder
  },
  {
    category: 'Files',
    command: 'Search for TODO in current directory',
    description: 'Search files',
    icon: Search
  },
  {
    category: 'Files',
    command: 'Get info about ~/Downloads/file.zip',
    description: 'File metadata',
    icon: HardDrive
  },

  // ============ APP CONTROL (3 commands) ============
  {
    category: 'Apps',
    command: 'open Safari',
    description: 'Launch app',
    icon: Globe
  },
  {
    category: 'Apps',
    command: 'quit Chrome',
    description: 'Close app',
    icon: CloseIcon
  },
  {
    category: 'Apps',
    command: 'What apps are running?',
    description: 'List running apps',
    icon: Activity
  },
  {
    category: 'Apps',
    command: 'List installed apps',
    description: 'Show all apps',
    icon: Settings
  },
  {
    category: 'Apps',
    command: 'Get app icon mapping',
    description: 'App icons info',
    icon: Image
  },

  // ============ SYSTEM CONTROL (20 commands) ============
  {
    category: 'System',
    command: 'Enable focus mode',
    description: 'Do Not Disturb on',
    icon: Eye
  },
  {
    category: 'System',
    command: 'Disable focus mode',
    description: 'Do Not Disturb off',
    icon: EyeOff
  },
  {
    category: 'System',
    command: 'Restart computer',
    description: 'Restart system',
    icon: RefreshCw
  },
  {
    category: 'System',
    command: 'Shutdown computer',
    description: 'Shutdown system',
    icon: Power
  },
  {
    category: 'System',
    command: 'Check WiFi status',
    description: 'WiFi information',
    icon: Wifi
  },
  {
    category: 'System',
    command: 'Set volume to 50',
    description: 'Adjust volume',
    icon: Volume2
  },
  {
    category: 'System',
    command: 'What\'s in my clipboard?',
    description: 'Check clipboard',
    icon: CopyIcon
  },
  {
    category: 'System',
    command: 'Copy "Hello World" to clipboard',
    description: 'Set clipboard',
    icon: CopyIcon
  },
  {
    category: 'System',
    command: 'Take screenshot',
    description: 'Capture screen',
    icon: Image
  },
  {
    category: 'System',
    command: 'Show notification: Build complete',
    description: 'Display notification',
    icon: Bell
  },
  {
    category: 'System',
    command: 'Show system info',
    description: 'Get system details',
    icon: Settings
  },
  {
    category: 'System',
    command: 'Empty trash',
    description: 'Clear trash',
    icon: Trash2
  },
  {
    category: 'System',
    command: 'Lock screen',
    description: 'Lock computer',
    icon: Lock
  },
  {
    category: 'System',
    command: 'Turn off WiFi',
    description: 'Disable WiFi',
    icon: Wifi
  },
  {
    category: 'System',
    command: 'Enable Bluetooth',
    description: 'Turn on Bluetooth',
    icon: Bluetooth
  },
  {
    category: 'System',
    command: 'Check battery status',
    description: 'Battery info',
    icon: Zap
  },
  {
    category: 'System',
    command: 'Enable dark mode',
    description: 'Toggle appearance',
    icon: Monitor
  },
  {
    category: 'System',
    command: 'Run ls -la',
    description: 'Shell command',
    icon: Terminal
  },
  {
    category: 'System',
    command: 'Sleep display',
    description: 'Turn off screen',
    icon: Monitor
  },

  // ============ BROWSER (11 commands) ============
  {
    category: 'Browser',
    command: 'Open google.com',
    description: 'Open URL',
    icon: Globe
  },
  {
    category: 'Browser',
    command: 'Search for "best restaurants NYC"',
    description: 'Web search',
    icon: Search
  },
  {
    category: 'Browser',
    command: 'What\'s the current tab?',
    description: 'Active tab info',
    icon: Globe
  },
  {
    category: 'Browser',
    command: 'Close current tab',
    description: 'Close tab',
    icon: CloseIcon
  },
  {
    category: 'Browser',
    command: 'Bookmark this page',
    description: 'Save bookmark',
    icon: Bookmark
  },
  {
    category: 'Browser',
    command: 'Save page as PDF',
    description: 'Export to PDF',
    icon: Download
  },
  {
    category: 'Browser',
    command: 'List all Chrome tabs',
    description: 'Show open tabs',
    icon: Globe
  },
  {
    category: 'Browser',
    command: 'Reload page',
    description: 'Refresh tab',
    icon: RefreshCw
  },
  {
    category: 'Browser',
    command: 'Go back',
    description: 'Navigate back',
    icon: ChevronLeft
  },
  {
    category: 'Browser',
    command: 'Go forward',
    description: 'Navigate forward',
    icon: ChevronRight
  },
  {
    category: 'Browser',
    command: 'Clear browser history',
    description: 'Delete browsing data',
    icon: Trash2
  },

  // ============ MEDIA CONTROL (12 commands) ============
  {
    category: 'Media',
    command: 'Play music',
    description: 'Play/pause',
    icon: Play
  },
  {
    category: 'Media',
    command: 'Pause Spotify',
    description: 'Pause playback',
    icon: Pause
  },
  {
    category: 'Media',
    command: 'Next song',
    description: 'Skip track',
    icon: SkipForward
  },
  {
    category: 'Media',
    command: 'Previous song',
    description: 'Go back track',
    icon: SkipBack
  },
  {
    category: 'Media',
    command: 'What\'s playing?',
    description: 'Current track info',
    icon: Music
  },
  {
    category: 'Media',
    command: 'Set Spotify volume to 70',
    description: 'Media volume',
    icon: Volume2
  },
  {
    category: 'Media',
    command: 'Play Bohemian Rhapsody',
    description: 'Search and play',
    icon: Search
  },
  {
    category: 'Media',
    command: 'Create playlist "Workout Mix"',
    description: 'New playlist',
    icon: Music
  },
  {
    category: 'Media',
    command: 'Add to playlist Favorites',
    description: 'Add to playlist',
    icon: Music
  },
  {
    category: 'Media',
    command: 'Enable shuffle',
    description: 'Toggle shuffle',
    icon: Shuffle
  },
  {
    category: 'Media',
    command: 'Repeat current song',
    description: 'Toggle repeat',
    icon: Repeat
  },
  {
    category: 'Media',
    command: 'Start screen recording',
    description: 'Record screen',
    icon: Video
  },

  // ============ PRODUCTIVITY (12 commands) ============
  {
    category: 'Tasks',
    command: 'Create task: Finish report by: ',
    description: 'New task',
    icon: CheckSquare
  },
  {
    category: 'Tasks',
    command: 'Show my tasks',
    description: 'List all tasks',
    icon: ListTodo
  },
  {
    category: 'Tasks',
    command: 'Complete task about report',
    description: 'Mark task done',
    icon: CheckSquare
  },
  {
    category: 'Tasks',
    command: 'Delete completed tasks',
    description: 'Remove tasks',
    icon: Trash2
  },
  {
    category: 'Focus',
    command: 'Start 25 minute pomodoro',
    description: 'Pomodoro timer',
    icon: Timer
  },
  {
    category: 'Focus',
    command: 'Take a 5 minute break',
    description: 'Break timer',
    icon: Clock
  },
  {
    category: 'Focus',
    command: 'Show my pomodoro stats',
    description: 'View statistics',
    icon: TrendingUp
  },
  {
    category: 'Habits',
    command: 'Mark exercise as done',
    description: 'Track habit',
    icon: Activity
  },
  {
    category: 'Habits',
    command: 'Show my exercise streak',
    description: 'View habit streak',
    icon: TrendingUp
  },
  {
    category: 'Notes',
    command: 'Search notes for "important"',
    description: 'Search productivity notes',
    icon: Search
  },
  {
    category: 'Tasks',
    command: 'List high priority tasks',
    description: 'Filter by priority',
    icon: ListTodo
  },
  {
    category: 'Focus',
    command: 'How many pomodoros today?',
    description: 'Daily stats',
    icon: Activity
  },

  // ============ QUICK NOTES (10 commands) ============
  {
    category: 'Quick Notes',
    command: 'remember to buy milk',
    description: 'Save quick note',
    icon: Lightbulb
  },
  {
    category: 'Quick Notes',
    command: 'what did I remember',
    description: 'Show saved notes',
    icon: FileText
  },
  {
    category: 'Quick Notes',
    command: 'forget all',
    description: 'Clear all notes',
    icon: Trash2
  },
  {
    category: 'Quick Notes',
    command: 'remember to call John tomorrow',
    description: 'Remember a task',
    icon: FileText
  },
  {
    category: 'Quick Notes',
    command: 'remember app idea: dark mode for settings',
    description: 'Remember an idea',
    icon: FileText
  },
  {
    category: 'Quick Notes',
    command: 'remember to buy: milk, eggs, bread',
    description: 'Remember shopping',
    icon: FileText
  },
  {
    category: 'Quick Notes',
    command: 'remember wifi password is Coffee2026',
    description: 'Remember a password',
    icon: FileText
  },
  {
    category: 'Quick Notes',
    command: 'remember to check github.com/anthropics',
    description: 'Remember a link',
    icon: FileText
  },
  {
    category: 'Quick Notes',
    command: 'remember team sync at 3pm today',
    description: 'Remember a meeting',
    icon: FileText
  },
  {
    category: 'Quick Notes',
    command: 'remember ',
    description: 'Remember something',
    icon: FileText
  },
];

export const getCommandsByCategory = () => {
  const categories: Record<string, TestCommand[]> = {};

  TEST_COMMANDS.forEach(cmd => {
    if (!categories[cmd.category]) {
      categories[cmd.category] = [];
    }
    categories[cmd.category].push(cmd);
  });

  return categories;
};

export const searchCommands = (query: string): TestCommand[] => {
  const lowerQuery = query.toLowerCase();
  return TEST_COMMANDS.filter(cmd =>
    cmd.command.toLowerCase().includes(lowerQuery) ||
    cmd.description.toLowerCase().includes(lowerQuery) ||
    cmd.category.toLowerCase().includes(lowerQuery)
  );
};
