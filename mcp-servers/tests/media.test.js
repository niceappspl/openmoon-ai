// Media MCP Server - Actually implemented tools (7)
export default [
  {
    name: 'play_pause_media',
    description: 'Toggle play/pause (system)',
    args: { app: 'system' }
  },
  {
    name: 'next_track',
    description: 'Skip to next track (system)',
    args: { app: 'system' }
  },
  {
    name: 'previous_track',
    description: 'Go to previous track (system)',
    args: { app: 'system' }
  },
  {
    name: 'get_current_track',
    description: 'Get current track info from Music',
    args: { app: 'Music' }
  },
  {
    name: 'set_media_volume',
    description: 'Set Music volume to 50%',
    args: { app: 'Music', volume: 50 }
  },
  {
    name: 'toggle_shuffle',
    description: 'Toggle shuffle in Music',
    args: { app: 'Music', enabled: true }
  },
  {
    name: 'capture_screenshot',
    description: 'Capture fullscreen screenshot',
    args: { type: 'fullscreen', path: '/tmp/moonos-media-screenshot.png' }
  }
];
