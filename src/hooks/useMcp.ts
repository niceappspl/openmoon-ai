import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const useMcp = () => {
  const [mcpLoading, setMcpLoading] = useState(true);

  useEffect(() => {
    const initMcp = async () => {
      try {
        setMcpLoading(true);
        await invoke<string>('start_mcp_server');
        
        // Wait additional time for MCP servers to fully initialize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Test if MCP servers are ready by trying to list tools
        try {
          await invoke<string>('list_mcp_tools');
          setMcpLoading(false);
        } catch (error) {
          // If tools listing fails, wait a bit more and try again
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            await invoke<string>('list_mcp_tools');
            setMcpLoading(false);
          } catch (error2) {
            // If still failing, proceed anyway but log the error
            console.warn('MCP servers may not be fully ready:', error2);
            setMcpLoading(false);
          }
        }
      } catch (error) {
        console.error('Failed to start MCP servers:', error);
        setMcpLoading(false);
      }
    };

    initMcp();
  }, []);

  return { mcpLoading };
};
