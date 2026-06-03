import { useState, useEffect, useRef } from 'react';

const PLACEHOLDERS = [
  "Ask me to automate anything...",
  "Take a screenshot",
  "Send a message to Mom",
  "What's my battery level?",
  "Play some focus music",
  "Open Notion and start a new page",
  "Set a timer for 25 minutes",
  "Show me today's calendar",
  "Remember to call the dentist",
  "Close all windows except this one",
];

const INTERVAL_MS = 3500;
const FADE_DURATION_MS = 200;

export function useRotatingPlaceholder(active: boolean): { placeholder: string; isFading: boolean } {
  const [index, setIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (active) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      setIndex(0);
      setIsFading(false);
      return;
    }

    timerRef.current = setInterval(() => {
      setIsFading(true);
      fadeTimerRef.current = setTimeout(() => {
        setIndex(prev => (prev + 1) % PLACEHOLDERS.length);
        setIsFading(false);
      }, FADE_DURATION_MS);
    }, INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [active]);

  return { placeholder: PLACEHOLDERS[index], isFading };
}
