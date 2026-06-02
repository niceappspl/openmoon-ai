import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AI_SUGGESTIONS, getAppIcon } from './utils/constants';
import { Mail, X, Sparkles, AlertTriangle, RotateCcw, Settings2 } from 'lucide-react';
import { classifyError, isBudgetResponse, type ClassifiedError } from './utils/errorClassifier';
import { useMcp } from './hooks/useMcp';
import { useApps } from './hooks/useApps';
import { useQuickNotes } from './hooks/useQuickNotes';
import { useRamMonitor } from './hooks/useRamMonitor';
import { useWindowManager } from './hooks/useWindowManager';
import { useProviderStatus } from './hooks/useProviderStatus';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useTokenCount } from './hooks/useTokenCount';
import { formatCostUsd } from './utils/tokens';
import { TopBar } from './components/TopBar';
import { CommandMenu } from './components/CommandMenu';
import { SuggestionsDropdown } from './components/SuggestionsDropdown';
import { ResponseDisplay } from './components/ResponseDisplay';
import { InputField } from './components/InputField';
import { LoadingIndicator, McpLoadingIndicator } from './components/LoadingIndicator';
import { QuickActions } from './components/QuickActions';
import { WorkflowRunner } from './components/WorkflowRunner';
import { TestCommandsLibrary } from './components/TestCommandsLibrary';
import { Settings } from './components/Settings';
import { Onboarding } from './components/Onboarding';
import { ApprovalCard, ApprovalRequest } from './components/ApprovalCard';
import { SaveWorkflowButton } from './components/SaveWorkflowButton';

const ONBOARDING_FLAG = 'openmoon.onboardingComplete';

interface AgentStep {
  step: number;
  kind: 'tool_call' | 'tool_result' | 'final';
  tool?: string;
  summary: string;
}

interface RecordedStep {
  action: string;
  params: Record<string, unknown>;
}

function App() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string>('');
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [showMcpTools, setShowMcpTools] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState(AI_SUGGESTIONS);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [showTestCommands, setShowTestCommands] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [suggestionJustSelected, setSuggestionJustSelected] = useState(false);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [recordedSteps, setRecordedSteps] = useState<RecordedStep[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [agentError, setAgentError] = useState<ClassifiedError | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPromptRef = useRef<string>('');

  // Custom hooks
  const { mcpLoading } = useMcp();
  const { runningApps, allApps, appIcons, appsLoading } = useApps(mcpLoading);
  const { quickNotes, addNote, clearNotes } = useQuickNotes();
  const { configured: providerConfigured, loading: providerLoading, refresh: refreshProvider } = useProviderStatus();
  const health = useHealthCheck(!mcpLoading);
  const ramUsage = useRamMonitor();
  const { tokens, costUsd } = useTokenCount(`${input}${response ? `\n${response}` : ''}`);
  const { adjustWindowSizeAndPosition } = useWindowManager(
    containerRef,
    [response, showSuggestions, showCommandMenu, input, filteredSuggestions.length, showTestCommands, showSettings, agentSteps.length, approval, recordedSteps.length, showOnboarding, providerConfigured, agentError],
    showWorkflows
  );

  // First-run onboarding: show when not previously completed AND no provider is configured.
  useEffect(() => {
    if (providerLoading) return;
    const completed = localStorage.getItem(ONBOARDING_FLAG) === 'true';
    if (!completed && !providerConfigured) {
      setShowOnboarding(true);
    }
  }, [providerLoading, providerConfigured]);

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_FLAG, 'true');
    setShowOnboarding(false);
    refreshProvider();
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem(ONBOARDING_FLAG, 'true');
    setShowOnboarding(false);
  };

  const openProviderSetup = () => {
    setShowOnboarding(true);
  };

  // Focus input on mount and after window positioning
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Focus input whenever window gains focus (like Spotlight)
  useEffect(() => {
    const setupFocusListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const window = getCurrentWindow();

        const unlisten = await window.onFocusChanged(({ payload: focused }) => {
          if (focused) {
            // Window gained focus - focus input immediately
            setTimeout(() => {
              textareaRef.current?.focus();
            }, 50);
          }
        });

        return unlisten;
      } catch (error) {
        console.error('Focus listener error:', error);
      }
    };

    let cleanup: (() => void) | undefined;
    setupFocusListener().then(unlisten => {
      cleanup = unlisten;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Agent loop progress events from the backend
  useEffect(() => {
    const unlistenPromise = listen<AgentStep>('agent-step', (event) => {
      const step = event.payload;
      if (step.kind === 'final') return;
      setAgentSteps(prev => [...prev, step]);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  // Security approval requests from the backend (`ask` policy tools)
  useEffect(() => {
    const unlistenPromise = listen<ApprovalRequest>('approval-request', (event) => {
      setApproval(event.payload);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  // Open the Settings panel from the tray menu
  useEffect(() => {
    const unlistenPromise = listen('open-settings', () => {
      setShowSettings(true);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = listen('open-workflows', () => {
      setShowWorkflows(true);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = listen('new-session', () => {
      setResponse('');
      setAgentSteps([]);
      setInput('');
      setApproval(null);
      setRecordedSteps([]);
      setAgentError(null);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  const handleApprovalDecision = (id: string, approved: boolean) => {
    invoke('respond_approval', { requestId: id, approved }).catch(() => {});
    setApproval(null);
  };

  const executePrompt = async (userMessage: string) => {
    lastPromptRef.current = userMessage;
    setIsLoading(true);
    setResponse('');
    setAgentError(null);
    setAgentSteps([]);
    setRecordedSteps([]);
    setShowSuggestions(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = '28px';
    }

    try {
      const result = await invoke<string>('send_prompt', { prompt: userMessage });
      setResponse(result);

      try {
        const steps = await invoke<RecordedStep[]>('get_recorded_steps');
        setRecordedSteps(steps);
      } catch {
        setRecordedSteps([]);
      }

      if (result.includes('Do you want to read the email content?')) {
        const mailSuggestions = [
          { icon: Mail, label: 'Yes', prompt: 'read email', category: 'Mail' },
          { icon: X, label: 'No', prompt: 'no thanks', category: 'Mail' },
        ];
        setFilteredSuggestions(mailSuggestions);
        setShowSuggestions(true);
        setSelectedSuggestion(0);
      }
    } catch (error) {
      setAgentError(classifyError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastPromptRef.current) {
      executePrompt(lastPromptRef.current);
    }
  };

  // Global keyboard handlers
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // ESC handler
      if (e.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false);
        } else if (showCommandMenu) {
          setShowCommandMenu(false);
        } else if (showWorkflows) {
          setShowWorkflows(false);
        } else if (showTestCommands) {
          setShowTestCommands(false);
        } else if (response || agentError) {
          setResponse('');
          setAgentError(null);
        } else if (showSuggestions) {
          setShowSuggestions(false);
        }
        return;
      }

      // Cmd+K - Open Test Commands
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowTestCommands(!showTestCommands);
        setShowCommandMenu(false); // Close other menus
        setShowWorkflows(false);
        return;
      }

      // Cmd+, - Open Settings/Command Menu
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowCommandMenu(!showCommandMenu);
        setShowTestCommands(false); // Close other menus
        setShowWorkflows(false);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showCommandMenu, showWorkflows, showTestCommands, showSettings, response, agentError, showSuggestions]);

  // Filter suggestions based on input
  useEffect(() => {
    // Don't show suggestions if user just selected one
    if (suggestionJustSelected) {
      return;
    }

    if (input.trim()) {
      const lowerInput = input.toLowerCase();
      const isQuitContext = /^(quit|close|exit|kill)\s+/i.test(input);

      // Extract search term - remove action keywords if present, otherwise use full input
      let searchTerm = input.replace(/^(open|launch|start|quit|close|exit|kill)\s+/i, '').trim();
      if (!searchTerm) {
        searchTerm = input.trim(); // If nothing left after removing keywords, use original
      }

      // Always search apps if there's any input
      const appsToShow = isQuitContext ? runningApps : allApps;
      const matchingApps = appsToShow
        .filter(app => app.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice(0, 8);

      if (matchingApps.length > 0) {
        const appSuggestions = matchingApps.map(app => ({
          icon: getAppIcon(app),
          label: app,
          prompt: `${isQuitContext ? 'Quit' : 'Open'} ${app}`,
          category: 'App',
          isRunning: runningApps.includes(app)
        }));

        setFilteredSuggestions(appSuggestions);
        setShowSuggestions(!response);
        setSelectedSuggestion(0);
        setTimeout(() => adjustWindowSizeAndPosition(), 10);
        return;
      }

      // Check if user is typing a specific mail command - don't show suggestions
      const isMailCommand = /^(read email|check mail|unread emails|send email|search emails)/i.test(input.trim());
      
      if (isMailCommand) {
        setShowSuggestions(false);
        return;
      }

      // If no apps match, fall back to AI suggestions
      const filtered = AI_SUGGESTIONS.filter(s =>
        s.label.toLowerCase().includes(lowerInput) ||
        s.category.toLowerCase().includes(lowerInput) ||
        s.prompt.toLowerCase().includes(lowerInput)
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0 && !response);
      setSelectedSuggestion(0);
      setTimeout(() => adjustWindowSizeAndPosition(), 10);
    } else {
      setFilteredSuggestions(AI_SUGGESTIONS);
      setShowSuggestions(false);
      setTimeout(() => adjustWindowSizeAndPosition(), 10);
    }
  }, [input, response, runningApps, allApps, adjustWindowSizeAndPosition, suggestionJustSelected]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Reset suggestion flag when user starts typing manually
    if (suggestionJustSelected) {
      setSuggestionJustSelected(false);
    }

    // Clear previous response when user starts typing
    if (value && response) {
      setResponse('');
    }
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 28 * 3;
      const newHeight = Math.min(scrollHeight, maxHeight);
      textareaRef.current.style.height = newHeight + 'px';

      setTimeout(() => {
        adjustWindowSizeAndPosition();
      }, 0);
    }
  };

  const handleClearResponse = () => {
    setResponse('');
    setAgentError(null);
    setAgentSteps([]);
    setRecordedSteps([]);
    setTimeout(() => {
      adjustWindowSizeAndPosition();
    }, 0);
  };

  const handleReplay = async (prompt: string) => {
    if (isLoading) return;
    setShowSettings(false);
    setIsLoading(true);
    setResponse('');
    setAgentSteps([]);
    setRecordedSteps([]);
    try {
      const result = await invoke<string>('send_prompt', { prompt });
      setResponse(result);
      invoke<RecordedStep[]>('get_recorded_steps')
        .then(setRecordedSteps)
        .catch(() => {});
    } catch (error) {
      setResponse(`Error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || mcpLoading || appsLoading) return;

    const userMessage = input.trim();

    // Reset suggestion flag when submitting
    setSuggestionJustSelected(false);

    // Quick Notes: "remember [something]"
    if (/^remember\s+/i.test(userMessage)) {
      const note = userMessage.replace(/^remember\s+/i, '').trim();
      const newNotes = addNote(note);
      setResponse(`Remembered: "${note}"\n\nYou now have ${newNotes.length} quick note${newNotes.length > 1 ? 's' : ''}.`);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = '28px';
      return;
    }

    // Quick Notes: "what did I remember" or "show notes"
    if (/^(what did i remember|show notes|my notes|recall)/i.test(userMessage)) {
      if (quickNotes.length === 0) {
        setResponse('You haven\'t remembered anything yet.\n\nTry: "remember to be happy"');
      } else {
        const notesList = quickNotes.map((note, i) => `${i + 1}. ${note}`).join('\n');
        setResponse(`Your Quick Notes (${quickNotes.length}):\n\n${notesList}\n\n_Tip: Say "forget all" to clear notes_`);
      }
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = '28px';
      return;
    }

    // Quick Notes: "forget all"
    if (/^forget all/i.test(userMessage)) {
      clearNotes();
      setResponse('All quick notes cleared.');
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = '28px';
      return;
    }

    // Direct app launch (Spotlight-style): if user typed just app name, launch it
    const lowerInput = userMessage.toLowerCase();
    const matchingApp = allApps.find(app => app.toLowerCase() === lowerInput);

    if (matchingApp) {
      setIsLoading(true);
      setResponse('');
      setInput('');
      setShowSuggestions(false);
      if (textareaRef.current) textareaRef.current.style.height = '28px';

      try {
        const result = await invoke<string>('open_application', { appName: matchingApp });
        setResponse(result);
      } catch (error) {
        setResponse(`Error: ${error}`);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // No usable AI provider yet — guide the user to setup instead of failing.
    if (!providerConfigured) {
      setShowSuggestions(false);
      setShowOnboarding(true);
      return;
    }

    setInput('');
    await executePrompt(userMessage);
  };

  const handleSuggestionClick = async (suggestion: typeof AI_SUGGESTIONS[0]) => {
    // If it's an app suggestion, open it directly
    if (suggestion.category === 'App') {
      const appName = suggestion.label;
      setShowSuggestions(false);
      setInput('');
      setIsLoading(true);
      if (textareaRef.current) textareaRef.current.style.height = '28px';

      try {
        const result = await invoke<string>('open_application', { appName });
        setResponse(result);
      } catch (error) {
        setResponse(`Error: ${error}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      // For non-app suggestions, fill the input and close suggestions
      setSuggestionJustSelected(true); // Prevent suggestions from re-appearing
      setInput(suggestion.prompt);
      setShowSuggestions(false);
      // Focus textarea after state updates
      setTimeout(() => {
        textareaRef.current?.focus();
        // Set cursor to end of text
        if (textareaRef.current) {
          const length = suggestion.prompt.length;
          textareaRef.current.setSelectionRange(length, length);
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (showSettings) {
        setShowSettings(false);
      } else if (showCommandMenu) {
        setShowCommandMenu(false);
      } else if (showWorkflows) {
        setShowWorkflows(false);
      } else if (showTestCommands) {
        setShowTestCommands(false);
      } else if (response || agentError) {
        setResponse('');
        setAgentError(null);
      } else {
        setShowSuggestions(false);
      }
      return;
    }

    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev => prev > 0 ? prev - 1 : prev);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const suggestion = filteredSuggestions[selectedSuggestion];
        handleSuggestionClick(suggestion);
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // If there's a selected suggestion, use it
      if (showSuggestions && filteredSuggestions.length > 0) {
        const suggestion = filteredSuggestions[selectedSuggestion];
        handleSuggestionClick(suggestion);
      } else {
        handleSubmit(e);
      }
    }
  };

  const handleShowMcpTools = async () => {
    try {
      const tools = await invoke<string>('list_mcp_tools');
      setResponse(tools);
      setShowMcpTools(!showMcpTools);
      setShowCommandMenu(false);
    } catch (error) {
      setResponse(`Error listing tools: ${error}`);
    }
  };

  return (
    <div
      className="relative w-full h-full rounded-xl bg-black overflow-visible transition-all duration-300"
      style={{
        boxShadow: '0 0 0 1.5px transparent',
        background: `
          linear-gradient(black, black) padding-box,
          linear-gradient(163deg, rgb(255, 137, 24) 28%, rgb(162, 41, 4) 54%, rgb(0, 0, 0) 68%, rgb(0, 152, 243) 100%) border-box
        `,
        border: '1.5px solid transparent',
      }}
    >
      <div ref={containerRef} className="px-3 py-2.5">
            <TopBar
              showCommandMenu={showCommandMenu}
              setShowCommandMenu={setShowCommandMenu}
              ramUsage={ramUsage}
              health={health}
              onOpenSettings={() => setShowSettings(true)}
              onOpenProviderSetup={openProviderSetup}
            />

            {showCommandMenu && (
              <CommandMenu
                onClose={() => setShowCommandMenu(false)}
                onShowMcpTools={handleShowMcpTools}
                onShowWorkflows={() => {
                  setShowWorkflows(true);
                  setResponse('');
                }}
                onShowTestCommands={() => {
                  setShowTestCommands(true);
                  setResponse('');
                }}
                onShowSettings={() => {
                  setShowSettings(true);
                }}
              />
            )}

            {showTestCommands && (
              <TestCommandsLibrary
                onClose={() => setShowTestCommands(false)}
                onCommandClick={(command) => {
                  setInput(command);
                  // Use setTimeout to ensure the input is updated before focusing
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.focus();
                      // Set cursor to end of text
                      const length = command.length;
                      textareaRef.current.setSelectionRange(length, length);
                    }
                  }, 0);
                }}
              />
            )}

            {showSettings && (
              <Settings
                onClose={() => {
                  setShowSettings(false);
                  refreshProvider();
                }}
                onReplay={handleReplay}
              />
            )}

            {showOnboarding && (
              <Onboarding onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />
            )}

            {mcpLoading || appsLoading ? (
              <McpLoadingIndicator />
            ) : showWorkflows ? (
              <WorkflowRunner onClose={() => setShowWorkflows(false)} />
            ) : !showCommandMenu && !showTestCommands && !showSettings && !showOnboarding ? (
              <>
                <InputField
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onSubmit={handleSubmit}
                  disabled={isLoading || mcpLoading || appsLoading}
                  placeholder="Ask me to automate anything..."
                  textareaRef={textareaRef}
                  isLoading={isLoading || mcpLoading || appsLoading}
                />

                {(input.trim() || response) && tokens > 0 && (
                  <div className="mt-2 flex justify-end">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
                      ~{tokens.toLocaleString()} tokens
                      {costUsd !== null && (
                        <span className="text-white/30">≈ {formatCostUsd(costUsd)}</span>
                      )}
                    </span>
                  </div>
                )}

                {!providerLoading && !providerConfigured && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                    <Sparkles className="h-4 w-4 text-yellow-400/80 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/80">No AI provider configured yet</p>
                      <p className="text-[10px] text-white/50 leading-relaxed mt-0.5">
                        Connect OpenAI or Ollama to start automating with natural language.
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={openProviderSetup}
                          className="px-2 py-1 rounded text-[10px] text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                        >
                          Set up provider
                        </button>
                        <button
                          onClick={() => setShowSettings(true)}
                          className="px-2 py-1 rounded text-[10px] text-white/60 border border-white/10 hover:bg-white/5 transition-colors"
                        >
                          Open Settings
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!input && !response && !showSuggestions && (
                  <QuickActions onActionClick={(prompt) => setInput(prompt)} />
                )}

                {showSuggestions && filteredSuggestions.length > 0 && (
                  <SuggestionsDropdown
                    suggestions={filteredSuggestions}
                    selectedIndex={selectedSuggestion}
                    appIcons={appIcons}
                    onSuggestionClick={handleSuggestionClick}
                  />
                )}

                {response && (
                  <ResponseDisplay
                    response={response}
                    onClear={handleClearResponse}
                  />
                )}

                {response && isBudgetResponse(response) && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => setShowSettings(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                    >
                      <Settings2 className="h-3 w-3" />
                      Raise limit in Settings
                    </button>
                  </div>
                )}

                {agentError && (
                  <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 backdrop-blur-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400/80 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/80">{agentError.message}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {agentError.category === 'provider' && (
                              <button
                                onClick={() => { setAgentError(null); setShowSettings(true); }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                              >
                                <Settings2 className="h-3 w-3" />
                                Open Settings
                              </button>
                            )}
                            {agentError.category === 'budget' && (
                              <button
                                onClick={() => { setAgentError(null); setShowSettings(true); }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                              >
                                <Settings2 className="h-3 w-3" />
                                Raise limit in Settings
                              </button>
                            )}
                            {(agentError.category === 'tool' || agentError.category === 'unknown') && (
                              <button
                                onClick={handleRetry}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-white/70 border border-white/20 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Retry
                              </button>
                            )}
                            <button
                              onClick={() => setAgentError(null)}
                              className="px-2.5 py-1 rounded-md text-[11px] text-white/40 hover:text-white/60 transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {approval && (
                  <ApprovalCard request={approval} onDecision={handleApprovalDecision} />
                )}

                {!isLoading && response && recordedSteps.length > 0 && (
                  <SaveWorkflowButton steps={recordedSteps} />
                )}

                {isLoading && agentSteps.length > 0 && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 space-y-1">
                    {agentSteps.map((step, i) => (
                      <div key={i} className="text-xs text-white/60 flex items-start gap-2">
                        <span className="text-white/40">{step.step}.</span>
                        <span>
                          {step.kind === 'tool_call' ? 'Calling' : 'Result'}
                          {step.tool ? ` ${step.tool}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {isLoading && <LoadingIndicator />}
              </>
            ) : null}
      </div>

      

    </div>
  );
}

export default App;
