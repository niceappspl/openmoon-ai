import { useCallback, useEffect, useRef, RefObject } from 'react';
import { getCurrentWindow, LogicalSize, LogicalPosition, availableMonitors } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

interface WindowState {
  normalPosition: { x: number; y: number } | null;
  isExpanded: boolean;
  maxHeight: number;
}

export const useWindowManager = (
  containerRef: RefObject<HTMLDivElement>,
  dependencies: any[],
  isWorkflowMode: boolean = false
) => {
  // Store window state with screen-responsive max height
  const windowStateRef = useRef<WindowState>({
    normalPosition: null,
    isExpanded: false,
    maxHeight: 600 // Will be updated with actual screen height
  });

  const adjustWindowSizeAndPosition = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      const window = getCurrentWindow();
      const monitors = await availableMonitors();
      if (!monitors || monitors.length === 0) return;

      const primaryMonitor = monitors[0];
      const screenSize = primaryMonitor.size;
      const screenScale = primaryMonitor.scaleFactor;
      const screenHeight = screenSize.height / screenScale;

      // Simple max height - 60% of screen height
      const maxHeight = Math.floor(screenHeight * 0.60);
      windowStateRef.current.maxHeight = maxHeight;

      // Fixed window width
      const windowWidth = 600;
      let windowHeight = 100;

      // Handle workflow mode (expanded view)
      if (isWorkflowMode) {
        const workflowWidth = 800;
        const workflowHeight = Math.min(600, maxHeight);

        if (!windowStateRef.current.isExpanded) {
          windowStateRef.current.isExpanded = true;
        }

        await window.setSize(new LogicalSize(workflowWidth, workflowHeight));
        await window.center();
        return;
      }

      // If returning from workflow mode
      if (windowStateRef.current.isExpanded && !isWorkflowMode) {
        windowStateRef.current.isExpanded = false;
      }

      // Normal mode - ONLY adjust height, NEVER move window
      const contentHeight = containerRef.current.offsetHeight;
      const minHeight = 100;
      const desiredHeight = contentHeight + 10;
      windowHeight = Math.min(Math.max(desiredHeight, minHeight), maxHeight);

      // Only update if height changed by more than 3px (prevent micro-adjustments)
      const currentSize = await window.outerSize();
      const heightDiff = Math.abs(currentSize.height - windowHeight);
      
      if (heightDiff > 3) {
        await window.setSize(new LogicalSize(windowWidth, windowHeight));
      } else {
      }

    } catch (error) {
      console.error('Window adjustment error:', error);
    }
  }, [containerRef, isWorkflowMode, ...dependencies]);

  // Initial sizing and positioning
  useEffect(() => {
    const initWindow = async () => {
      try {
        const window = getCurrentWindow();
        const monitors = await availableMonitors();

        if (monitors && monitors.length > 0) {
          const primaryMonitor = monitors[0];
          const screenSize = primaryMonitor.size;
          const screenScale = primaryMonitor.scaleFactor;
          const screenWidth = screenSize.width / screenScale;
          const screenHeight = screenSize.height / screenScale;

          // Position window in upper third of screen, centered horizontally
          const windowWidth = 600;
          const windowHeight = 100;
          const x = (screenWidth - windowWidth) / 2;
          const y = screenHeight * 0.20; // 20% from top

          await window.setSize(new LogicalSize(windowWidth, windowHeight));
          await window.setPosition(new LogicalPosition(x, y));

        }
      } catch (error) {
        console.error('Initial sizing error:', error);
      }
    };

    initWindow();
  }, []);

  // Adjust on dependency changes
  useEffect(() => {
    // Delay to ensure DOM has updated (CommandMenu has 200ms animation)
    const timer = setTimeout(() => {
      adjustWindowSizeAndPosition();
    }, 250);
    return () => clearTimeout(timer);
  }, [adjustWindowSizeAndPosition]);

  // Setup blur listener
  useEffect(() => {
    const setupBlurListener = async () => {
      try {
        const window = getCurrentWindow();
        const unlisten = await window.onFocusChanged(({ payload: focused }) => {
          if (!focused) {
            invoke('hide_window').catch(() => {});
          }
        });

        return () => {
          unlisten();
        };
      } catch (error) {
        console.error('Blur listener error:', error);
      }
    };

    setupBlurListener();
  }, []);

  return { adjustWindowSizeAndPosition };
};