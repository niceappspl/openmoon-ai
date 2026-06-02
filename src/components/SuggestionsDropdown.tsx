import { LucideIcon } from 'lucide-react';

interface Suggestion {
  icon: LucideIcon;
  label: string;
  prompt: string;
  category: string;
  isRunning?: boolean;
}

interface SuggestionsDropdownProps {
  suggestions: Suggestion[];
  selectedIndex: number;
  appIcons: Record<string, string>;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

export const SuggestionsDropdown = ({
  suggestions,
  selectedIndex,
  appIcons,
  onSuggestionClick
}: SuggestionsDropdownProps) => {
  return (
    <div className="mt-2 rounded-lg bg-black/95 border border-white/10 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="max-h-[300px] overflow-y-auto">
        {suggestions.map((suggestion, index) => {
          const Icon = suggestion.icon;
          const hasRealIcon = suggestion.category === 'App' && appIcons[suggestion.label];
          const isRunning = suggestion.isRunning;

          return (
            <button
              key={index}
              onClick={() => onSuggestionClick(suggestion)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors ${
                index === selectedIndex ? 'bg-white/5' : ''
              }`}
            >
              <div className={`mt-0.5 ${hasRealIcon ? 'relative' : 'p-1.5'} rounded-lg ${
                index === selectedIndex && !hasRealIcon
                  ? 'bg-gradient-to-br from-orange-500/30 to-fuchsia-500/30'
                  : !hasRealIcon ? 'bg-white/5' : ''
              }`}>
                {hasRealIcon ? (
                  <>
                    <img
                      src={appIcons[suggestion.label]}
                      alt={suggestion.label}
                      className="h-6 w-6 rounded-md"
                    />
                    {isRunning && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-black/50" />
                    )}
                  </>
                ) : (
                  <Icon className="h-3.5 w-3.5 text-white/80" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white/90">{suggestion.label}</span>
                  {isRunning && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                      Running
                    </span>
                  )}
                  {!isRunning && suggestion.category === 'App' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">
                      {suggestion.category}
                    </span>
                  )}
                  {suggestion.category !== 'App' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">
                      {suggestion.category}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 mt-0.5 line-clamp-1">
                  {suggestion.prompt}
                </p>
              </div>
              {index === selectedIndex && (
                <div className="text-[10px] text-white/40 mt-1">Tab</div>
              )}
            </button>
          );
        })}
      </div>
      <div className="border-t border-white/10 px-3 py-1.5 bg-white/5">
        <div className="flex items-center justify-between text-[10px] text-white/40">
          <span>↑↓ Navigate</span>
          <span>Tab to select</span>
          <span>Enter to execute</span>
        </div>
      </div>
    </div>
  );
};
