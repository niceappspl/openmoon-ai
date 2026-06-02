// Dynamic loading messages for openMOON
export const LOADING_MESSAGES = [
  "Processing...",
  "Working...",
  "Loading...",
  "Executing...",
  "Analyzing...",
  "Preparing...",
  "Connecting...",
  "Please wait...",
  "Almost ready...",
  "One moment..."
];

export const getRandomLoadingMessage = (): string => {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
};

// For sequential rotation through messages
export const getLoadingMessageByIndex = (index: number): string => {
  return LOADING_MESSAGES[index % LOADING_MESSAGES.length];
};