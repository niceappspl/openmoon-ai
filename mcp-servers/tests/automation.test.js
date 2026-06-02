// Automation MCP Server - All tools (including mail, maps, calendar, messages, reminders, notes, contacts)
export default [
  {
    name: 'open_app',
    description: 'Open Calculator app',
    args: { app: 'Calculator' }
  },
  {
    name: 'quit_app',
    description: 'Quit Calculator app',
    args: { app: 'Calculator' }
  },
  {
    name: 'focus_mode',
    description: 'Enable Do Not Disturb',
    args: { enabled: true }
  },
  {
    name: 'get_running_apps',
    description: 'Get list of running apps',
    args: {}
  },
  {
    name: 'run_shell_command',
    description: 'Run echo command',
    args: { command: 'echo "MoonOS Test"' }
  },
  {
    name: 'set_volume',
    description: 'Set system volume to 50%',
    args: { volume: 50 }
  },
  {
    name: 'get_clipboard',
    description: 'Get clipboard content',
    args: {}
  },
  {
    name: 'set_clipboard',
    description: 'Set clipboard to test text',
    args: { text: 'MoonOS Test Clipboard' }
  },
  {
    name: 'take_screenshot',
    description: 'Take screenshot to /tmp',
    args: { path: '/tmp/moonos-auto-screenshot.png', interactive: false }
  },
  {
    name: 'show_notification',
    description: 'Show test notification',
    args: { title: 'MoonOS', message: 'Test notification from automation' }
  },
  {
    name: 'get_system_info',
    description: 'Get software system info',
    args: { type: 'software' }
  },
  {
    name: 'empty_trash',
    description: 'Empty trash (normal)',
    args: { secure: false }
  },
  {
    name: 'lock_screen',
    description: 'Lock screen',
    args: {}
  },
  {
    name: 'sleep_display',
    description: 'Put display to sleep',
    args: {}
  },
  {
    name: 'restart_computer',
    description: 'Schedule restart with delay',
    args: { delay: 300 }
  },
  {
    name: 'shutdown_computer',
    description: 'Schedule shutdown with delay',
    args: { delay: 300 }
  },
  {
    name: 'toggle_wifi',
    description: 'Toggle WiFi on',
    args: { enabled: true }
  },
  {
    name: 'toggle_bluetooth',
    description: 'Toggle Bluetooth on',
    args: { enabled: true }
  },
  {
    name: 'get_battery_status',
    description: 'Get battery status',
    args: {}
  },
  {
    name: 'toggle_dark_mode',
    description: 'Toggle dark mode',
    args: { enabled: true }
  },
  {
    name: 'mail_unread',
    description: 'Check unread emails',
    args: { limit: 5 }
  },
  {
    name: 'mail_search',
    description: 'Search emails for test',
    args: { query: 'test', limit: 3 }
  },
  {
    name: 'maps_search',
    description: 'Search for coffee shops',
    args: { query: 'coffee shops', limit: 3 }
  },
  {
    name: 'maps_directions',
    description: 'Get directions to airport',
    args: { to: 'airport', from: 'current location', transport: 'driving' }
  },
  {
    name: 'calendar_events',
    description: 'Get calendar events for next 7 days',
    args: { days: 7 }
  },
  {
    name: 'calendar_create',
    description: 'Create calendar event',
    args: { title: 'Test Meeting', start: '2026-01-15 14:00', end: '2026-01-15 15:00' }
  },
  {
    name: 'messages_send',
    description: 'Send test message',
    args: { to: 'test@example.com', message: 'Test message from MoonOS' }
  },
  {
    name: 'reminders_list',
    description: 'List reminders',
    args: { completed: false }
  },
  {
    name: 'reminders_create',
    description: 'Create reminder',
    args: { title: 'Test reminder from MoonOS' }
  },
  {
    name: 'notes_list',
    description: 'List notes',
    args: { limit: 5 }
  },
  {
    name: 'notes_create',
    description: 'Create note',
    args: { title: 'Test Note', content: 'This is a test note from MoonOS' }
  },
  {
    name: 'contacts_search',
    description: 'Search contacts',
    args: { query: 'test' }
  }
];
