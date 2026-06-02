import { useState, useEffect, useRef } from 'react';
import { BookOpen, Copy, Check, Search, X, Play } from 'lucide-react';
import { TEST_COMMANDS, getCommandsByCategory, searchCommands } from '../utils/testCommands';

interface TestCommandsLibraryProps {
  onClose: () => void;
  onCommandClick: (command: string) => void;
}

export const TestCommandsLibrary = ({ onClose, onCommandClick }: TestCommandsLibraryProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commandsByCategory = getCommandsByCategory();
  const filteredCommands = searchQuery ? searchCommands(searchQuery) : TEST_COMMANDS;

  // Auto focus search on mount and ensure first item is selected
  useEffect(() => {
    searchInputRef.current?.focus();
    // Ensure we start with first command selected
    setSelectedIndex(0);

    // Small delay to ensure DOM is ready, then scroll to first item
    setTimeout(() => {
      const firstElement = listRef.current?.querySelector('[data-index="0"]');
      if (firstElement) {
        firstElement.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
    }, 50);
  }, []);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with search input typing, but allow arrows
      if (e.target === searchInputRef.current &&
          e.key !== 'ArrowDown' &&
          e.key !== 'ArrowUp' &&
          e.key !== 'Enter') {
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
      }

      // Enter to execute
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          handleCommandClick(filteredCommands[selectedIndex].command);
        }
      }

      // Cmd+C to copy
      else if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          handleCopy(filteredCommands[selectedIndex].command, selectedIndex);
        }
      }

      // Tab to cycle through commands
      else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          setSelectedIndex(prev => prev > 0 ? prev - 1 : filteredCommands.length - 1);
        } else {
          setSelectedIndex(prev =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
        }
      }

      // Quick filter - any letter/number focuses search
      else if (/^[a-zA-Z0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedElement) {
      selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleCopy = (command: string, index: number) => {
    navigator.clipboard.writeText(command);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCommandClick = (command: string) => {
    onCommandClick(command);
    onClose();
  };

  return (
    <div className="mt-2 rounded-lg bg-black/95 border border-white/10 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-yellow-400/70" />
          <h3 className="text-sm font-medium text-white/90">Test Commands Library</h3>
          <span className="text-xs text-white/40">({filteredCommands.length} commands)</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/5 transition-colors"
          title="Close (ESC)"
        >
          <X className="h-4 w-4 text-white/50" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commands... (↑↓ to navigate, Enter to use)"
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-md text-white/90 placeholder-white/40 focus:outline-none focus:border-yellow-400/30"
          />
        </div>
      </div>

      {/* Commands List */}
      <div ref={listRef} className="max-h-[350px] overflow-y-auto p-2 space-y-1">
        {searchQuery ? (
          // Show search results
          filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, index) => (
              <div
                key={index}
                data-index={index}
                className={`group p-2 rounded-md transition-all border ${
                  selectedIndex === index
                    ? 'bg-yellow-400/10 border-yellow-400/30'
                    : 'hover:bg-white/5 border-transparent hover:border-white/10'
                }`}
                onClick={() => handleCommandClick(cmd.command)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded-md bg-white/5 border border-white/10 mt-0.5 flex-shrink-0">
                    <cmd.icon className="h-3 w-3 text-white/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] text-white/40 uppercase tracking-wide">
                        {cmd.category}
                      </span>
                      {selectedIndex === index && (
                        <span className="text-[10px] text-yellow-400/60">
                          Press Enter to use
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/60 mb-1">{cmd.description}</div>
                    <code className={`text-[11px] font-mono block truncate ${
                      selectedIndex === index ? 'text-yellow-400' : 'text-yellow-400/70'
                    }`}>
                      {cmd.command}
                    </code>
                  </div>
                  <div className={`flex gap-1 transition-opacity ${
                    selectedIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCommandClick(cmd.command);
                      }}
                      className="p-1.5 rounded hover:bg-yellow-400/10 transition-colors"
                      title="Use command (Enter)"
                    >
                      <Play className="h-3 w-3 text-yellow-400/70" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(cmd.command, index);
                      }}
                      className="p-1.5 rounded hover:bg-white/10 transition-colors"
                      title="Copy command (Cmd+C)"
                    >
                      {copiedIndex === index ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-white/50" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-white/40 text-xs">
              No commands found for "{searchQuery}"
            </div>
          )
        ) : (
          // Show by categories
          Object.entries(commandsByCategory).map(([category, commands]) => (
            <div key={category} className="mb-3">
              <div className="px-2 py-1 text-[10px] font-medium text-white/50 uppercase tracking-wider">
                {category} ({commands.length})
              </div>
              <div className="space-y-1">
                {commands.map((cmd, index) => {
                  // Since filteredCommands === TEST_COMMANDS when no search, we can use it
                  const commandIndex = filteredCommands.indexOf(cmd);
                  const isSelected = selectedIndex === commandIndex;
                  return (
                    <div
                      key={index}
                      data-index={commandIndex}
                      className={`group p-2 rounded-md transition-all border ${
                        isSelected
                          ? 'bg-yellow-400/10 border-yellow-400/30'
                          : 'hover:bg-white/5 border-transparent hover:border-white/10'
                      }`}
                      onClick={() => handleCommandClick(cmd.command)}
                      onMouseEnter={() => setSelectedIndex(commandIndex)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="p-1.5 rounded-md bg-white/5 border border-white/10 mt-0.5 flex-shrink-0">
                          <cmd.icon className="h-3 w-3 text-white/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] text-white/40 uppercase tracking-wide">
                              {cmd.category}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] text-yellow-400/60">
                                Enter to use
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-white/60 mb-1">{cmd.description}</div>
                          <code className={`text-[11px] font-mono block truncate ${
                            isSelected ? 'text-yellow-400' : 'text-yellow-400/70'
                          }`}>
                            {cmd.command}
                          </code>
                        </div>
                        <div className={`flex gap-1 transition-opacity ${
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCommandClick(cmd.command);
                            }}
                            className="p-1.5 rounded hover:bg-yellow-400/10 transition-colors"
                            title="Use command (Enter)"
                          >
                            <Play className="h-3 w-3 text-yellow-400/70" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(cmd.command, commandIndex);
                            }}
                            className="p-1.5 rounded hover:bg-white/10 transition-colors"
                            title="Copy command (Cmd+C)"
                          >
                            {copiedIndex === commandIndex ? (
                              <Check className="h-3 w-3 text-green-400" />
                            ) : (
                              <Copy className="h-3 w-3 text-white/50" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-white/10 bg-black/50">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-white/40">
            {selectedIndex + 1} of {filteredCommands.length}
          </div>
          <div className="text-[10px] text-white/40">
            ↑↓ Navigate • Enter Use • Cmd+C Copy • Tab Cycle • ESC Close
          </div>
        </div>
      </div>
    </div>
  );
};