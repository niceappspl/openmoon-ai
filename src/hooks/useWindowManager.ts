import { useCallback, useEffect, useRef, RefObject } from 'react';
import { getCurrentWindow, LogicalSize, LogicalPosition, availableMonitors } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

interface WindowState {
  normalPosition: { x: number; y: number } | null;
  isExpanded: boolean;
  maxHeight: number;
  maxHeightComputed: boolean;
}

const WINDOW_WIDTH = 600;
const WORKFLOW_WIDTH = 800;
const MIN_HEIGHT = 100;
const HEIGHT_BUFFER = 10;
const HEIGHT_THRESHOLD = 3;
const DEFAULT_MAX_HEIGHT = 600;

export const useWindowManager = (
  containerRef: RefObject<HTMLDivElement>,
  dependencies: unknown[],
  isWorkflowMode: boolean = false
) => {
  // Store window state with screen-responsive max height
  const windowStateRef = useRef<WindowState>({
    normalPosition: null,
    isExpanded: false,
    maxHeight: DEFAULT_MAX_HEIGHT,
    maxHeightComputed: false
  });

  // Coalesce rapid resize requests into a single per-frame measurement
  const rafRef = useRef<number | null>(null);
  // Track the last logical height we applied to skip no-op setSize calls
  const lastAppliedHeightRef = useRef<number>(0);

  const ensureMaxHeight = useCallback(async (): Promise<number> => {
    if (windowStateRef.current.maxHeightComputed) {
      return windowStateRef.current.maxHeight;
    }
    const monitors = await availableMonitors();
    if (monitors && monitors.length > 0) {
      const primaryMonitor = monitors[0];
      const screenHeight = primaryMonitor.size.height / primaryMonitor.scaleFactor;
      windowStateRef.current.maxHeight = Math.floor(screenHeight * 0.6);
      windowStateRef.current.maxHeightComputed = true;
    }
    return windowStateRef.current.maxHeight;
  }, []);

  const performResize = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      const window = getCurrentWindow();
      const maxHeight = await ensureMaxHeight();

      // Workflow mode (expanded view) — fixed size, centered
      if (isWorkflowMode) {
        const workflowHeight = Math.min(600, maxHeight);
        windowStateRef.current.isExpanded = true;
        lastAppliedHeightRef.current = workflowHeight;
        await window.setSize(new LogicalSize(WORKFLOW_WIDTH, workflowHeight));
        await window.center();
        return;
      }

      if (windowStateRef.current.isExpanded) {
        windowStateRef.current.isExpanded = false;
      }

      // Measure full content height (independent of any cap we apply below)
      const desiredHeight = el.scrollHeight + HEIGHT_BUFFER;
      const windowHeight = Math.min(Math.max(desiredHeight, MIN_HEIGHT), maxHeight);

      // Past the cap, let the content scroll internally instead of clipping
      const overflowing = desiredHeight > maxHeight;
      el.style.maxHeight = overflowing ? `${maxHeight - HEIGHT_BUFFER}px` : '';
      el.style.overflowY = overflowing ? 'auto' : '';

      // Skip churn: only resize when the target differs meaningfully
      if (Math.abs(lastAppliedHeightRef.current - windowHeight) > HEIGHT_THRESHOLD) {
        lastAppliedHeightRef.current = windowHeight;
        await window.setSize(new LogicalSize(WINDOW_WIDTH, windowHeight));
      }
    } catch (error) {
      console.error('Window adjustment error:', error);
    }
  }, [containerRef, isWorkflowMode, ensureMaxHeight]);

  // Public API: schedule a coalesced resize on the next animation frame
  const adjustWindowSizeAndPosition = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      void performResize();
    });
  }, [performResize]);

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

          windowStateRef.current.maxHeight = Math.floor(screenHeight * 0.6);
          windowStateRef.current.maxHeightComputed = true;

          // Position window in upper third of screen, centered horizontally
          const windowHeight = MIN_HEIGHT;
          const x = (screenWidth - WINDOW_WIDTH) / 2;
          const y = screenHeight * 0.2; // 20% from top

          await window.setSize(new LogicalSize(WINDOW_WIDTH, windowHeight));
          await window.setPosition(new LogicalPosition(x, y));
          lastAppliedHeightRef.current = windowHeight;
        }
      } catch (error) {
        console.error('Initial sizing error:', error);
      }
    };

    initWindow();
  }, []);

  // Observe content size changes and coalesce them into smooth resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      adjustWindowSizeAndPosition();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [containerRef, adjustWindowSizeAndPosition]);

  // Adjust on dependency changes (e.g. menus with entry animations)
  useEffect(() => {
    // Delay to ensure DOM has updated (CommandMenu has 200ms animation)
    const timer = setTimeout(() => {
      adjustWindowSizeAndPosition();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustWindowSizeAndPosition, isWorkflowMode, ...dependencies]);

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
