import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const useMcp = () => {
  const [mcpLoading, setMcpLoading] = useState(true);

  useEffect(() => {
    const initMcp = async () => {
      try {
        setMcpLoading(true);
        await invoke<string>('start_mcp_server');
        setMcpLoading(false);
      } catch (error) {
        console.error('Failed to start MCP servers:', error);
        setMcpLoading(false);
      }
    };

    initMcp();
  }, []);

  return { mcpLoading };
};
