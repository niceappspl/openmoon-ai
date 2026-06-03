// Filesystem MCP Server - All 5 tools
export default [
  {
    name: 'read_file',
    description: 'Read package.json',
    args: { path: 'package.json' }
  },
  {
    name: 'write_file',
    description: 'Write test file to /tmp',
    args: { path: '/tmp/moonos-test.txt', content: 'openMOON AI Test File Content' }
  },
  {
    name: 'list_directory',
    description: 'List current directory',
    args: { path: '.' }
  },
  {
    name: 'search_files',
    description: 'Search files by name',
    args: { query: 'package', type: 'name', path: '.' }
  },
  {
    name: 'get_file_info',
    description: 'Get package.json info',
    args: { path: 'package.json' }
  }
];
