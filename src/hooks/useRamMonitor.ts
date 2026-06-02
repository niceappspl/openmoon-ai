import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const useRamMonitor = () => {
  const [ramUsage, setRamUsage] = useState<number>(0);

  useEffect(() => {
    const updateRam = async () => {
      try {
        const result = await invoke<{ totalMB: number }>('get_memory_usage');
        setRamUsage(result.totalMB);
      } catch (error) {
      }
    };

    updateRam();
    const interval = setInterval(updateRam, 2000);

    return () => clearInterval(interval);
  }, []);

  return ramUsage;
};
