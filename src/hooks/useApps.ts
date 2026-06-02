import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const useApps = (mcpLoading: boolean) => {
  const [runningApps, setRunningApps] = useState<string[]>([]);
  const [allApps, setAllApps] = useState<string[]>([]);
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});
  const [appSystemNames, setAppSystemNames] = useState<Record<string, string>>({}); // Mapping: displayName -> systemName
  const [hasInitialized, setHasInitialized] = useState(false);
  const [appsLoading, setAppsLoading] = useState(false);

  useEffect(() => {
    if (mcpLoading || hasInitialized) return;

    const fetchApps = async () => {
      try {
        setAppsLoading(true);
        
        // Get all installed applications using MCP (for localized names)
        const result = await invoke<string>('send_prompt', {
          prompt: 'Use get_installed_apps tool to list all installed applications and return ONLY their names, one per line, nothing else'
        });

        // Parse app names from the response - better filtering
        const lines = result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const installedApps: string[] = [];

        for (const line of lines) {
          // Skip all non-app lines
          if (line.includes('Installed') || line.includes('applications') || line.includes('total') || line.includes(':') || 
              line.includes('get_installed_apps') || line.includes('Use ') || line.includes('tool to') || 
              line.includes('return ONLY') || line.includes('nothing else') || line.includes('GET') || 
              line.includes('INSTALLED') || line.includes('APPS') || line.includes('**') ||
              line.includes('```') || line.length < 2) {
            continue;
          }
          // Remove leading markers (-, *, numbers, etc)
          const cleaned = line.replace(/^[-*•\d.)\s]+/, '').trim();
          if (cleaned.length > 0 && cleaned.length > 2) {
            installedApps.push(cleaned);
          }
        }

        setAllApps(installedApps);

        // Get app icon mapping first
        try {
          const mappingResult = await invoke<string>('send_prompt', {
            prompt: 'Use get_app_icon_mapping tool to get mapping of localized app names to system names for icon retrieval'
          });

          const mappingMatch = mappingResult.match(/\{[\s\S]*\}/);
          const mapping = mappingMatch ? JSON.parse(mappingMatch[0]) : {};
          setAppSystemNames(mapping);

          // Fetch icons in parallel for faster loading
          const iconPromises = installedApps.map(async (app) => {
            try {
              const systemName = mapping[app] || app;
              const iconBase64 = await invoke<string>('get_app_icon_path', { appName: systemName });
              return { app, iconBase64 };
            } catch (e) {
              try {
                const iconBase64 = await invoke<string>('get_app_icon_path', { appName: app });
                return { app, iconBase64 };
              } catch (e2) {
                return null;
              }
            }
          });

          const iconResults = await Promise.all(iconPromises);
          const iconsMap: Record<string, string> = {};
          iconResults.forEach(result => {
            if (result) {
              iconsMap[result.app] = result.iconBase64;
            }
          });
          setAppIcons(iconsMap);
        } catch (e) {
          // Fallback
        }

        // Get running apps - for now keep using MCP but with better parsing
        try {
          const result = await invoke<string>('send_prompt', {
            prompt: 'Use get_running_apps tool to list all running applications and return ONLY their names, one per line, nothing else'
          });

          const lines = result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          const runningAppsList: string[] = [];

          for (const line of lines) {
            // Skip all non-app lines
            if (line.includes('Here') || line.includes('running') || line.includes('application') || line.includes(':') ||
                line.includes('get_running_apps') || line.includes('Use ') || line.includes('tool to') || 
                line.includes('return ONLY') || line.includes('nothing else') || line.includes('GET') || 
                line.includes('INSTALLED') || line.includes('APPS') || line.includes('**') ||
                line.includes('Total') || line.includes('more running')) {
              continue;
            }
            const cleaned = line.replace(/^[-*•\d.)\s]+/, '').trim();
            if (cleaned.length > 0 && !cleaned.includes('```') && cleaned.length > 2) {
              runningAppsList.push(cleaned);
            }
          }

          setRunningApps(runningAppsList);
        } catch (error) {
          console.warn('Failed to get running apps:', error);
        }

        setHasInitialized(true);
        setAppsLoading(false);
      } catch (error) {
        setAppsLoading(false);
      }
    };

    fetchApps();
  }, [mcpLoading, hasInitialized]);

  return { runningApps, allApps, appIcons, appSystemNames, appsLoading };
};
