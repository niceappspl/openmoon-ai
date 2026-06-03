// Browser MCP Server - Actually implemented tools (6)
export default [
  {
    name: 'open_url',
    description: 'Open example.com',
    args: { url: 'https://example.com' }
  },
  {
    name: 'search_web',
    description: 'Search Google for openMOON AI',
    args: { query: 'openMOON AI', engine: 'google' }
  },
  {
    name: 'get_active_tab_info',
    description: 'Get active tab info from Safari',
    args: { browser: 'Safari' }
  },
  {
    name: 'close_tab',
    description: 'Close current tab in Safari',
    args: { browser: 'Safari' }
  },
  {
    name: 'list_open_tabs',
    description: 'List all open tabs in Safari',
    args: { browser: 'Safari' }
  },
  {
    name: 'reload_tab',
    description: 'Reload current tab in Safari',
    args: { browser: 'Safari', hard_reload: false }
  }
];
