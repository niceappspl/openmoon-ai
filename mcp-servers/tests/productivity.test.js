// Productivity MCP Server - Actually implemented tools (5)
export default [
  {
    name: 'create_task',
    description: 'Create high priority task',
    args: { title: 'Test Task from MCP', priority: 'high', tags: ['test', 'mcp'] }
  },
  {
    name: 'list_tasks',
    description: 'List all tasks',
    args: { status: 'all' }
  },
  {
    name: 'complete_task',
    description: 'Complete a task (requires task_id)',
    args: { task_id: '1' }
  },
  {
    name: 'create_note',
    description: 'Create markdown note',
    args: {
      title: 'Test Note',
      content: '# openMOON AI Test\n\nThis is a test note with **markdown**.',
      tags: ['test', 'mcp']
    }
  },
  {
    name: 'start_pomodoro',
    description: 'Start 1-minute pomodoro',
    args: { duration: 1, task: 'Testing MCP Tools' }
  }
];
