import { useState, useEffect } from 'react';
import { getLoadingMessageByIndex } from '../utils/loadingMessages';

export const LoadingIndicator = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(getLoadingMessageByIndex(0));
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // Change message every 2 seconds
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setMessageIndex(prev => prev + 1);
        setIsTransitioning(false);
      }, 200);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCurrentMessage(getLoadingMessageByIndex(messageIndex));
  }, [messageIndex]);

  return (
    <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/10 backdrop-blur-sm">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-blue-500/20 rounded-lg blur-md animate-pulse"></div>
          <img
            src="/icon.png"
            alt="openMOON"
            className="relative w-6 h-6 rounded-md"
            style={{
              animation: 'gentleRotate 4s ease-in-out infinite'
            }}
          />
        </div>
        <span
          className={`text-xs text-white/70 font-medium transition-all duration-200 ${
            isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
        >
          {currentMessage}
        </span>
      </div>
    </div>
  );
};

export const McpLoadingIndicator = () => {
  const [loadingStep, setLoadingStep] = useState(0);
  const steps = [
    "Starting MCP servers...",
    "Initializing automation tools...",
    "Loading application database...",
    "Preparing AI assistant...",
    "Almost ready..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % steps.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-6 animate-in fade-in duration-300">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-blue-500/20 rounded-xl blur-lg animate-pulse"></div>
        <img
          src="/icon.png"
          alt="openMOON"
          className="relative w-12 h-12 rounded-xl"
          style={{
            animation: 'gentleRotate 4s ease-in-out infinite'
          }}
        />
      </div>
      <p className="mt-3 text-xs text-white/60 animate-pulse">{steps[loadingStep]}</p>
      <div className="mt-2 w-32 h-1 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-orange-500 to-blue-500 rounded-full transition-all duration-1000"
          style={{
            width: `${((loadingStep + 1) / steps.length) * 100}%`
          }}
        />
      </div>
    </div>
  );
};
