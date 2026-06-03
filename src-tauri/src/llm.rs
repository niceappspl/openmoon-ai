use async_openai::{
    config::OpenAIConfig,
    types::{
        ChatCompletionMessageToolCall, ChatCompletionRequestAssistantMessageArgs,
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessageArgs,
        ChatCompletionRequestToolMessageArgs, ChatCompletionRequestUserMessageArgs,
        ChatCompletionTool, ChatCompletionToolArgs, ChatCompletionToolType,
        CreateChatCompletionRequestArgs, FunctionCall, FunctionObjectArgs,
    },
    Client,
};
use chrono;
use serde::Serialize;
use std::future::Future;

/// A single persisted conversation turn used for session memory.
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Progress event emitted on each iteration of the agent loop.
#[derive(Debug, Clone, Serialize)]
pub struct AgentStep {
    pub step: u32,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    pub summary: String,
}

/// A single tool invocation requested by the model, provider-agnostic.
#[derive(Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    /// Raw JSON-encoded arguments.
    pub arguments: String,
}

/// Provider-agnostic chat message used to drive `run_agent`.
#[derive(Debug, Clone)]
pub enum ProviderMessage {
    System(String),
    User(String),
    Assistant {
        content: Option<String>,
        tool_calls: Vec<ToolCall>,
    },
    Tool {
        tool_call_id: String,
        content: String,
    },
}

/// Result of a single chat-completions step: either tool calls to run or final text.
#[derive(Debug, Clone)]
pub struct ChatStepResult {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
}

/// Per-session spend guard for the agent loop.
#[derive(Debug, Clone)]
pub struct Budget {
    /// Hard cap on agent steps before stopping.
    pub max_steps: u32,
    /// Approximate USD spend cap (`0.0` = unlimited).
    pub max_cost_usd: f64,
    /// USD price per 1M input tokens, when the provider/model is known and
    /// priceable. `None` disables cost enforcement (e.g. local Ollama models).
    pub input_price_per_mtok: Option<f64>,
}

/// USD price per 1M input tokens for known models. Returns `None` for unknown
/// models so cost enforcement is skipped rather than guessed. Mirrors the
/// frontend price table in `src/utils/tokens.ts`.
pub fn input_price_per_mtok(provider: &str, model: &str) -> Option<f64> {
    match provider {
        "openai" => {
            let price = match model {
                "gpt-4o-mini" => 0.15,
                "gpt-4o" => 2.5,
                "gpt-4.1" => 2.0,
                "gpt-4.1-mini" => 0.4,
                "gpt-4.1-nano" => 0.1,
                "gpt-4-turbo" => 10.0,
                "gpt-3.5-turbo" => 0.5,
                _ => return None,
            };
            Some(price)
        }
        "anthropic" => {
            let price = match model {
                "claude-opus-4-5" => 15.0,
                "claude-sonnet-4-5" => 3.0,
                "claude-haiku-3-5" => 0.8,
                _ => return None,
            };
            Some(price)
        }
        _ => None,
    }
}

/// Best-effort input-token estimate for the messages sent in one step, using a
/// documented ~4-chars-per-token heuristic. Each step re-sends the full
/// (growing) context, so accumulating this across steps approximates the
/// dominant input-token cost of a runaway loop without extra plumbing.
fn estimate_input_tokens(messages: &[ProviderMessage]) -> u32 {
    let mut chars = 0usize;
    for message in messages {
        match message {
            ProviderMessage::System(content) | ProviderMessage::User(content) => {
                chars += content.len();
            }
            ProviderMessage::Assistant {
                content,
                tool_calls,
            } => {
                if let Some(content) = content {
                    chars += content.len();
                }
                for call in tool_calls {
                    chars += call.name.len() + call.arguments.len();
                }
            }
            ProviderMessage::Tool { content, .. } => {
                chars += content.len();
            }
        }
    }
    (chars / 4) as u32
}

/// Abstraction over a chat-completions-with-tools backend used by the agent loop.
#[async_trait::async_trait]
pub trait LlmProvider: Send + Sync {
    async fn chat_step(
        &self,
        messages: &[ProviderMessage],
        tools: &serde_json::Value,
    ) -> Result<ChatStepResult, String>;
}

/// The default system prompt template. Placeholders: `{current_date}`,
/// `{current_weekday}`, `{current_time}`, `{tool_context}`.
pub const DEFAULT_SYSTEM_PROMPT_TEMPLATE: &str =
"You are openMOON - an intelligent AI system controller for macOS. Your job is to understand user intent and accomplish the user's goal by calling the most appropriate tools.

CURRENT DATE AND TIME:
Today is: {current_date} ({current_weekday})
Current time: {current_time}
When working with dates, ALWAYS use the current date above, not 2023 or any other year.

AGENT LOOP:
You operate in a multi-step loop. You may call one or more tools, observe their results (provided back to you as tool messages), and then decide on the next step. Chain tool calls when a task needs several actions. When the user's goal is fully accomplished, reply with a concise final answer in natural language and DO NOT call any more tools.

CORE PRINCIPLES:
1. PREFER TOOLS for any actionable request; only answer with plain text when the task is done or no tool fits
2. UNDERSTAND INTENT across languages (English, Polish, Spanish, French, German, etc.)
3. BE CONTEXTUAL - consider what the user actually wants to accomplish and use prior conversation context
4. BE FLEXIBLE - users express requests in many different ways

CRITICAL PATTERN MATCHING:
⚠️ Pattern 'open [app] and [action]' → Use the SPECIFIC tool for [action], NOT just open_app!
   - Pattern: 'open spotify and play X' → search_and_play with query=X, app=Spotify
   - Pattern: 'open safari and go to X' → open_url with url=X
   - Pattern: 'open calendar and create event' → calendar_create
⚠️ Pattern 'play [song/artist] on [app]' → ALWAYS use search_and_play, never open_app!

INTENT RECOGNITION:
Analyze the user's request to understand their true goal, not just keywords:

COMMUNICATION INTENT:
- Messages/SMS: 'send message', 'text', 'wyślij wiadomość', 'napisz do'
- Email: 'send email', 'wyślij email', 'napisz email'
- Search messages: 'find messages', 'search texts', 'szukaj wiadomości'

PRODUCTIVITY INTENT:
- Tasks: 'create task', 'add todo', 'dodaj zadanie', 'przypomnij mi'
- Notes: 'create note', 'write down', 'zapisz notatkę', 'notatka'
- Calendar: 'schedule', 'meeting', 'spotkanie', 'kalendarz', 'wydarzenie', 'show calendar', 'pokaż kalendarz', 'what meetings', 'jakie spotkania'
- Reminders: 'remind me', 'przypomnij', 'alarm'

SYSTEM CONTROL INTENT:
- Apps: 'open', 'launch', 'uruchom', 'otwórz' + app name
  * System automatically finds the correct app name in system language
  * Examples: 'weather', 'pogoda', 'music', 'muzyka', 'calendar', 'kalendarz'
  * Browser apps: 'safari', 'chrome', 'firefox', 'edge'
  * System apps: 'finder', 'terminal', 'activity monitor'
- Files: 'list files', 'show files', 'pokaż pliki', 'folder'
- Screenshots: 'screenshot', 'capture', 'zrzut ekranu'
- Volume: 'volume', 'głośność', 'sound'
- WiFi/Network: 'wifi', 'internet', 'connection', 'network', 'połączenie' → get_wifi_info or search_web
- Battery: 'battery', 'bateria', 'power', 'charging' → get_battery_status

MEDIA INTENT:
- Play music on Spotify/Music: Use search_and_play tool for ANY request to play music!
  * Pattern: 'play X on spotify' → search_and_play with query=X, app=Spotify
  * Pattern: 'open spotify and play X' → search_and_play with query=X, app=Spotify
  * Pattern: 'listen to X' → search_and_play with query=X, app=Spotify
  * CRITICAL: When user mentions both opening music app AND playing something, use search_and_play NOT open_app!
- Media controls: 'pause', 'next track', 'previous track' → play_pause_media, next_track, previous_track
- Current track: 'what is playing', 'current song' → get_current_track
- Screenshots: 'screenshot', 'capture', 'zrzut' → capture_screenshot

BROWSER INTENT:
- Web search: 'search', 'google', 'wyszukaj', 'pogoda', 'weather'
- Open website: 'open website', 'go to', 'otwórz stronę'

MAPS INTENT:
- Search locations: 'search for X with Maps', 'find X in Maps' → maps_search with query='X'
- Get directions: 'get directions to X', 'directions from X to Y', 'navigate to X' → maps_directions with to='X', from='current location' (ALWAYS provide from, use 'current location' if not specified)
Note: For directions, ALWAYS include both from and to. If user doesn't specify starting point, use 'current location' as from.

MAIL INTENT:
- Search emails: 'search emails for X', 'find emails about X' → mail_search with query='X'
- Unread emails: 'unread emails', 'check mail', 'new emails' → mail_unread
- Read email: 'read email', 'read first email', 'read email about X', 'yes' → mail_read with subject='X' or index=1
- Send email: 'send email to X', 'email X about Y' → mail_send with to='X', subject='Y', body='content'
- Decline: 'no thanks', 'no', 'skip' → return text response 'No problem!'

CALENDAR INTENT:
- List events: 'calendar events', 'my schedule', 'upcoming events' → calendar_events
- Create event: 'create calendar event', 'schedule meeting' → calendar_create with title, start, end

MESSAGES INTENT:
- Send message: 'send message to X', 'text X' → messages_send with to='X', message='content'

REMINDERS INTENT:
- List reminders: 'my reminders', 'reminders list' → reminders_list
- Create reminder: 'create reminder', 'remind me to X' → reminders_create with title

NOTES INTENT:
- List notes: 'my notes', 'notes list' → notes_list
- Create note: 'create note', 'new note' → notes_create with title, content

CONTACTS INTENT:
- Search contacts: 'find contact X', 'search contacts for X' → contacts_search with query='X'

TIME INTENT:
- Check time: 'what time is it', 'current time', 'what's the time', 'jaka jest godzina' → get_current_time
- Check date: 'what date is it', 'today's date', 'jaka jest data' → get_current_date

SMART ROUTING:
- Weather queries → search_web (not show_notification!)
- App names → open_app (not search_notes!)
- 'otwórz aplikację X' → open_app with app name
- 'uruchom X' → open_app with app name  
- File operations → filesystem tools
- System control → automation tools
- Media control → media tools
- Communication → apple MCP tools

CONTEXT AWARENESS:
- Use current date/time for relative dates
- Infer location from context when possible
- Consider user's likely workflow

ADVANCED INTENT ANALYSIS:
1. Look for ACTION VERBS: send, create, open, search, play, show, get, find
2. Identify TARGET OBJECTS: message, note, file, app, website, music
3. Recognize MODIFIERS: tomorrow, today, urgent, important, specific names
4. Understand IMPLICIT CONTEXT: 'weather' likely means search_web, not notification

EXAMPLES OF SMART ROUTING:
- 'jaka jutro pogoda' → search_web (weather query)
- 'otwórz aplikację pogoda' → open_app (finds 'Pogoda' automatically)
- 'otwórz przypomnienia' → open_app (finds 'Przypomnienia' automatically)
- 'otwórz notatki' → open_app (finds 'Notatki' automatically)
- 'otwórz kalendarz' → open_app (finds 'Kalendarz' automatically)
- 'pokaż kalendarz' → calendar (view calendar events)
- 'jakie spotkania mam jutro' → calendar (view tomorrow's events)
- 'wyślij wiadomość do mamy' → send_message (communication)
- 'otwórz spotify' → open_app (app control)
- 'zrób zrzut ekranu' → capture_screenshot (media)
- 'dodaj zadanie' → create_task (productivity)
- 'pokaż pliki' → list_directory (filesystem)
- 'czy mam połączenie z WiFi' → get_wifi_info (network status)
- 'jaka jest nazwa mojej sieci wifi' → get_wifi_info (network status)
- 'do jakiej sieci jestem podłączony' → get_wifi_info (network status)
- 'what is my wifi status' → get_wifi_info (network status)
- 'am I connected to internet' → get_wifi_info (network status)
- 'show battery' → get_battery_status (battery info)
- 'get directions to Stary Browar Poznań with Maps' → maps_directions with to='Stary Browar Poznań', from='current location'
- 'search for parks with Maps' → maps_search with query='parks'
- 'directions from home to work' → maps_directions with from='home', to='work'
- 'navigate to airport' → maps_directions with to='airport', from='current location'
- 'yes' (after mail check) → mail_read (read first email)
- 'no' (after mail check) → return text 'No problem!'

FALLBACK STRATEGY:
If uncertain about intent, prefer the most common/expected action for the context.
If user input cannot be mapped to any tool, return a helpful text response explaining what you can do.
NEVER use show_notification as a fallback - it doesn't work properly.

CONTEXT AWARENESS:
- If user just checked emails and says 'yes' → mail_read
- If user just checked emails and says 'no' → return 'No problem!'
- If user input is unclear → return helpful text response
- If user input is gibberish → return 'I didn\'t understand that. Try asking me to open an app, check emails, or help with something specific.'

AVAILABLE TOOLS:
{tool_context}

You are an INTELLIGENT AGENT. Understand the user's true intent and chain tools as needed to fulfill it, then summarize the outcome.";

fn build_system_prompt(template: &str, tool_context: &str) -> String {
    let current_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let current_time = chrono::Local::now().format("%H:%M:%S").to_string();
    let current_weekday = chrono::Local::now().format("%A").to_string();
    template
        .replace("{current_date}", &current_date)
        .replace("{current_weekday}", &current_weekday)
        .replace("{current_time}", &current_time)
        .replace("{tool_context}", tool_context)
}

/// Runs the agentic loop: model -> tool call(s) -> tool result(s) -> next step
/// until the model returns a final assistant message with no tool calls or the
/// step limit is reached. `execute_tool` performs a single tool call and returns
/// the (raw) tool output text; `on_step` receives progress events. The model
/// step is delegated to the configured `LlmProvider`. `system_prompt_template`
/// overrides the bundled default when `Some`; pass `None` to use the default.
pub async fn run_agent<F, Fut, E>(
    provider: &dyn LlmProvider,
    prompt: &str,
    history: &[ChatMessage],
    tools: &serde_json::Value,
    budget: Budget,
    system_prompt_template: Option<&str>,
    execute_tool: F,
    mut on_step: E,
) -> Result<String, String>
where
    F: Fn(String, serde_json::Value) -> Fut,
    Fut: Future<Output = Result<String, String>>,
    E: FnMut(AgentStep),
{
    let tool_context = generate_tool_context(tools)?;
    let template = system_prompt_template.unwrap_or(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
    let system_prompt = build_system_prompt(template, &tool_context);

    let mut messages: Vec<ProviderMessage> = Vec::new();
    messages.push(ProviderMessage::System(system_prompt));

    for msg in history {
        if msg.role == "assistant" {
            messages.push(ProviderMessage::Assistant {
                content: Some(msg.content.clone()),
                tool_calls: Vec::new(),
            });
        } else {
            messages.push(ProviderMessage::User(msg.content.clone()));
        }
    }

    messages.push(ProviderMessage::User(prompt.to_string()));

    let mut estimated_cost_usd = 0.0_f64;

    for step in 1..=budget.max_steps {
        if let Some(price) = budget.input_price_per_mtok {
            let step_tokens = estimate_input_tokens(&messages);
            estimated_cost_usd += (step_tokens as f64 / 1_000_000.0) * price;
        }

        let result = provider.chat_step(&messages, tools).await?;

        if result.tool_calls.is_empty() {
            let final_text = result.content.clone().unwrap_or_default();
            on_step(AgentStep {
                step,
                kind: "final".to_string(),
                tool: None,
                summary: final_text.clone(),
            });
            return Ok(final_text);
        }

        messages.push(ProviderMessage::Assistant {
            content: result.content.clone(),
            tool_calls: result.tool_calls.clone(),
        });

        for tool_call in &result.tool_calls {
            let name = tool_call.name.clone();
            let args: serde_json::Value = serde_json::from_str(&tool_call.arguments)
                .unwrap_or_else(|_| serde_json::json!({}));

            on_step(AgentStep {
                step,
                kind: "tool_call".to_string(),
                tool: Some(name.clone()),
                summary: serde_json::to_string(&args).unwrap_or_default(),
            });

            let result_text = match execute_tool(name.clone(), args).await {
                Ok(text) => text,
                Err(e) => format!("Error: {}", e),
            };

            on_step(AgentStep {
                step,
                kind: "tool_result".to_string(),
                tool: Some(name.clone()),
                summary: summarize(&result_text),
            });

            messages.push(ProviderMessage::Tool {
                tool_call_id: tool_call.id.clone(),
                content: result_text,
            });
        }

        if budget.max_cost_usd > 0.0 && estimated_cost_usd >= budget.max_cost_usd {
            let summary = format!(
                "Reached the cost budget (~${:.2}) for this task — stopped to avoid runaway cost. Raise it in Settings.",
                budget.max_cost_usd
            );
            on_step(AgentStep {
                step,
                kind: "budget".to_string(),
                tool: None,
                summary: summary.clone(),
            });
            return Ok(summary);
        }
    }

    let summary = format!(
        "Reached the step budget ({}) for this task — stopped to avoid runaway cost. Raise it in Settings.",
        budget.max_steps
    );
    on_step(AgentStep {
        step: budget.max_steps,
        kind: "budget".to_string(),
        tool: None,
        summary: summary.clone(),
    });
    Ok(summary)
}

fn convert_mcp_tools_to_openai(
    mcp_tools: &serde_json::Value,
) -> Result<Vec<ChatCompletionTool>, String> {
    let tools_array = mcp_tools["tools"]
        .as_array()
        .ok_or("Invalid tools format")?;

    let mut openai_tools = Vec::new();

    for tool in tools_array {
        let name = tool["name"]
            .as_str()
            .ok_or("Tool missing name")?
            .to_string();
        let description = tool["description"]
            .as_str()
            .ok_or("Tool missing description")?
            .to_string();
        let parameters = tool["inputSchema"].clone();

        let function = FunctionObjectArgs::default()
            .name(name)
            .description(description)
            .parameters(parameters)
            .build()
            .map_err(|e| format!("Failed to build function: {}", e))?;

        let tool = ChatCompletionToolArgs::default()
            .r#type(ChatCompletionToolType::Function)
            .function(function)
            .build()
            .map_err(|e| format!("Failed to build tool: {}", e))?;

        openai_tools.push(tool);
    }

    Ok(openai_tools)
}

fn generate_tool_context(tools: &serde_json::Value) -> Result<String, String> {
    let mut context = String::new();

    if let Some(servers) = tools.as_object() {
        for (server_name, server_data) in servers {
            if let Some(tools_array) = server_data["tools"].as_array() {
                context.push_str(&format!(
                    "\n{} SERVER ({} tools):\n",
                    server_name.to_uppercase(),
                    tools_array.len()
                ));

                for tool in tools_array {
                    if let (Some(name), Some(description)) =
                        (tool["name"].as_str(), tool["description"].as_str())
                    {
                        context.push_str(&format!("- {}: {}\n", name, description));
                    }
                }
            }
        }
    }

    Ok(context)
}

/// OpenAI-backed provider wrapping `async-openai` (default model gpt-4o-mini).
pub struct OpenAiProvider {
    client: Client<OpenAIConfig>,
    model: String,
}

impl OpenAiProvider {
    pub fn new(api_key: String, model: String) -> Self {
        let config = OpenAIConfig::new().with_api_key(api_key);
        Self {
            client: Client::with_config(config),
            model,
        }
    }

    pub fn with_base_url(api_key: String, model: String, base_url: &str) -> Self {
        let config = OpenAIConfig::new()
            .with_api_key(api_key)
            .with_api_base(base_url);
        Self {
            client: Client::with_config(config),
            model,
        }
    }
}

fn to_openai_messages(
    messages: &[ProviderMessage],
) -> Result<Vec<ChatCompletionRequestMessage>, String> {
    let mut out = Vec::with_capacity(messages.len());

    for message in messages {
        match message {
            ProviderMessage::System(content) => {
                out.push(ChatCompletionRequestMessage::System(
                    ChatCompletionRequestSystemMessageArgs::default()
                        .content(content.clone())
                        .build()
                        .map_err(|e| format!("Failed to build system message: {}", e))?,
                ));
            }
            ProviderMessage::User(content) => {
                out.push(ChatCompletionRequestMessage::User(
                    ChatCompletionRequestUserMessageArgs::default()
                        .content(content.clone())
                        .build()
                        .map_err(|e| format!("Failed to build user message: {}", e))?,
                ));
            }
            ProviderMessage::Assistant {
                content,
                tool_calls,
            } => {
                let mut builder = ChatCompletionRequestAssistantMessageArgs::default();
                if let Some(content) = content {
                    if !content.is_empty() {
                        builder.content(content.clone());
                    }
                }
                if !tool_calls.is_empty() {
                    let calls: Vec<ChatCompletionMessageToolCall> = tool_calls
                        .iter()
                        .map(|tc| ChatCompletionMessageToolCall {
                            id: tc.id.clone(),
                            r#type: ChatCompletionToolType::Function,
                            function: FunctionCall {
                                name: tc.name.clone(),
                                arguments: tc.arguments.clone(),
                            },
                        })
                        .collect();
                    builder.tool_calls(calls);
                }
                out.push(ChatCompletionRequestMessage::Assistant(
                    builder
                        .build()
                        .map_err(|e| format!("Failed to build assistant message: {}", e))?,
                ));
            }
            ProviderMessage::Tool {
                tool_call_id,
                content,
            } => {
                out.push(ChatCompletionRequestMessage::Tool(
                    ChatCompletionRequestToolMessageArgs::default()
                        .content(content.clone())
                        .tool_call_id(tool_call_id.clone())
                        .build()
                        .map_err(|e| format!("Failed to build tool message: {}", e))?,
                ));
            }
        }
    }

    Ok(out)
}

#[async_trait::async_trait]
impl LlmProvider for OpenAiProvider {
    async fn chat_step(
        &self,
        messages: &[ProviderMessage],
        tools: &serde_json::Value,
    ) -> Result<ChatStepResult, String> {
        let openai_tools = convert_mcp_tools_to_openai(tools)?;
        let openai_messages = to_openai_messages(messages)?;

        let request = CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .messages(openai_messages)
            .tools(openai_tools)
            .build()
            .map_err(|e| format!("Failed to build request: {}", e))?;

        let response = self
            .client
            .chat()
            .create(request)
            .await
            .map_err(|e| format!("OpenAI API error: {}", e))?;

        let choice = response
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| "No response from OpenAI".to_string())?;
        let message = choice.message;

        let tool_calls = message
            .tool_calls
            .unwrap_or_default()
            .into_iter()
            .map(|tc| ToolCall {
                id: tc.id,
                name: tc.function.name,
                arguments: tc.function.arguments,
            })
            .collect();

        Ok(ChatStepResult {
            content: message.content,
            tool_calls,
        })
    }
}

/// Ollama-backed provider using the native `/api/chat` endpoint with tools.
/// Tool-calling support depends on the chosen model (e.g. `llama3.1`); models
/// or endpoints without tool support surface a clear error.
pub struct OllamaProvider {
    client: reqwest::Client,
    base_url: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(base_url: String, model: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url,
            model,
        }
    }
}

/// Maps Ollama's characteristic "model does not support tools" failure into an
/// actionable message. Returns `None` for unrelated errors so the caller can
/// surface the raw detail.
fn tool_support_error(model: &str, detail: &str) -> Option<String> {
    if detail.to_lowercase().contains("does not support tools") {
        Some(format!(
            "Model '{}' doesn't support tool calling — pick a compatible model like llama3.1 or qwen2.5.",
            model
        ))
    } else {
        None
    }
}

fn to_ollama_messages(messages: &[ProviderMessage]) -> Vec<serde_json::Value> {
    messages
        .iter()
        .map(|message| match message {
            ProviderMessage::System(content) => {
                serde_json::json!({ "role": "system", "content": content })
            }
            ProviderMessage::User(content) => {
                serde_json::json!({ "role": "user", "content": content })
            }
            ProviderMessage::Assistant {
                content,
                tool_calls,
            } => {
                let mut value = serde_json::json!({
                    "role": "assistant",
                    "content": content.clone().unwrap_or_default(),
                });
                if !tool_calls.is_empty() {
                    let calls: Vec<serde_json::Value> = tool_calls
                        .iter()
                        .map(|tc| {
                            let args: serde_json::Value = serde_json::from_str(&tc.arguments)
                                .unwrap_or_else(|_| serde_json::json!({}));
                            serde_json::json!({
                                "function": { "name": tc.name, "arguments": args }
                            })
                        })
                        .collect();
                    value["tool_calls"] = serde_json::Value::Array(calls);
                }
                value
            }
            ProviderMessage::Tool { content, .. } => {
                serde_json::json!({ "role": "tool", "content": content })
            }
        })
        .collect()
}

fn to_ollama_tools(tools: &serde_json::Value) -> Result<Vec<serde_json::Value>, String> {
    let tools_array = tools["tools"].as_array().ok_or("Invalid tools format")?;

    Ok(tools_array
        .iter()
        .filter_map(|tool| {
            let name = tool["name"].as_str()?;
            let description = tool["description"].as_str().unwrap_or("");
            Some(serde_json::json!({
                "type": "function",
                "function": {
                    "name": name,
                    "description": description,
                    "parameters": tool["inputSchema"].clone(),
                }
            }))
        })
        .collect())
}

#[async_trait::async_trait]
impl LlmProvider for OllamaProvider {
    async fn chat_step(
        &self,
        messages: &[ProviderMessage],
        tools: &serde_json::Value,
    ) -> Result<ChatStepResult, String> {
        let url = format!("{}/api/chat", self.base_url.trim_end_matches('/'));

        let body = serde_json::json!({
            "model": self.model,
            "messages": to_ollama_messages(messages),
            "tools": to_ollama_tools(tools)?,
            "stream": false,
        });

        let response = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        let status = response.status();
        let payload: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        if !status.is_success() {
            let detail = payload["error"]
                .as_str()
                .unwrap_or("unknown error")
                .to_string();
            if let Some(message) = tool_support_error(&self.model, &detail) {
                return Err(message);
            }
            return Err(format!("Ollama error ({}): {}", status, detail));
        }

        let message = &payload["message"];
        let content = message["content"].as_str().map(|s| s.to_string());

        let tool_calls = message["tool_calls"]
            .as_array()
            .map(|calls| {
                calls
                    .iter()
                    .enumerate()
                    .filter_map(|(index, call)| {
                        let function = &call["function"];
                        let name = function["name"].as_str()?.to_string();
                        let arguments = if function["arguments"].is_string() {
                            function["arguments"].as_str().unwrap_or("{}").to_string()
                        } else {
                            function["arguments"].to_string()
                        };
                        Some(ToolCall {
                            id: format!("call_{}", index),
                            name,
                            arguments,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let content = match content {
            Some(text) if text.is_empty() => None,
            other => other,
        };

        Ok(ChatStepResult {
            content,
            tool_calls,
        })
    }
}

/// Anthropic-backed provider using the `/v1/messages` API with tool use.
pub struct AnthropicProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model,
        }
    }
}

/// Converts `ProviderMessage` slice to Anthropic format, extracting the system
/// message separately (Anthropic takes it as a top-level field) and batching
/// consecutive `Tool` results into a single user message with `tool_result`
/// content blocks (as required by the Anthropic Messages API).
fn to_anthropic_messages(
    messages: &[ProviderMessage],
) -> (Option<String>, Vec<serde_json::Value>) {
    let mut system_content: Option<String> = None;
    let mut out: Vec<serde_json::Value> = Vec::new();

    let mut i = 0;
    while i < messages.len() {
        match &messages[i] {
            ProviderMessage::System(content) => {
                system_content = Some(content.clone());
                i += 1;
            }
            ProviderMessage::User(content) => {
                out.push(serde_json::json!({ "role": "user", "content": content }));
                i += 1;
            }
            ProviderMessage::Assistant {
                content,
                tool_calls,
            } => {
                let mut blocks: Vec<serde_json::Value> = Vec::new();
                if let Some(text) = content {
                    if !text.is_empty() {
                        blocks.push(serde_json::json!({ "type": "text", "text": text }));
                    }
                }
                for tc in tool_calls {
                    let input: serde_json::Value = serde_json::from_str(&tc.arguments)
                        .unwrap_or_else(|_| serde_json::json!({}));
                    blocks.push(serde_json::json!({
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": input,
                    }));
                }
                if blocks.is_empty() {
                    blocks.push(serde_json::json!({ "type": "text", "text": "" }));
                }
                out.push(serde_json::json!({ "role": "assistant", "content": blocks }));
                i += 1;
            }
            ProviderMessage::Tool { .. } => {
                let mut result_blocks: Vec<serde_json::Value> = Vec::new();
                while i < messages.len() {
                    if let ProviderMessage::Tool {
                        tool_call_id,
                        content,
                    } = &messages[i]
                    {
                        result_blocks.push(serde_json::json!({
                            "type": "tool_result",
                            "tool_use_id": tool_call_id,
                            "content": content,
                        }));
                        i += 1;
                    } else {
                        break;
                    }
                }
                out.push(serde_json::json!({ "role": "user", "content": result_blocks }));
            }
        }
    }

    (system_content, out)
}

fn to_anthropic_tools(tools: &serde_json::Value) -> Result<Vec<serde_json::Value>, String> {
    let tools_array = tools["tools"].as_array().ok_or("Invalid tools format")?;
    Ok(tools_array
        .iter()
        .filter_map(|tool| {
            let name = tool["name"].as_str()?;
            let description = tool["description"].as_str().unwrap_or("");
            Some(serde_json::json!({
                "name": name,
                "description": description,
                "input_schema": tool["inputSchema"].clone(),
            }))
        })
        .collect())
}

#[async_trait::async_trait]
impl LlmProvider for AnthropicProvider {
    async fn chat_step(
        &self,
        messages: &[ProviderMessage],
        tools: &serde_json::Value,
    ) -> Result<ChatStepResult, String> {
        let (system_content, anthropic_messages) = to_anthropic_messages(messages);
        let anthropic_tools = to_anthropic_tools(tools)?;

        let mut body = serde_json::json!({
            "model": self.model,
            "max_tokens": 4096,
            "messages": anthropic_messages,
            "tools": anthropic_tools,
        });
        if let Some(system) = system_content {
            body["system"] = serde_json::Value::String(system);
        }

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {}", e))?;

        let status = response.status();
        let payload: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;

        if !status.is_success() {
            let detail = payload["error"]["message"]
                .as_str()
                .unwrap_or("unknown error")
                .to_string();
            return Err(format!("Anthropic error ({}): {}", status, detail));
        }

        let content_blocks = payload["content"]
            .as_array()
            .ok_or_else(|| "Missing content in Anthropic response".to_string())?;

        let mut text_content: Option<String> = None;
        let mut tool_calls: Vec<ToolCall> = Vec::new();

        for block in content_blocks {
            match block["type"].as_str() {
                Some("text") => {
                    if let Some(text) = block["text"].as_str() {
                        if !text.is_empty() {
                            text_content = Some(text.to_string());
                        }
                    }
                }
                Some("tool_use") => {
                    let id = block["id"].as_str().unwrap_or("").to_string();
                    let name = block["name"].as_str().unwrap_or("").to_string();
                    let arguments = block["input"].to_string();
                    tool_calls.push(ToolCall { id, name, arguments });
                }
                _ => {}
            }
        }

        Ok(ChatStepResult {
            content: text_content,
            tool_calls,
        })
    }
}

/// Trims a tool result to a short, single-line summary for progress events.
fn summarize(text: &str) -> String {
    let condensed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    const MAX: usize = 160;
    if condensed.chars().count() > MAX {
        let truncated: String = condensed.chars().take(MAX).collect();
        format!("{}…", truncated)
    } else {
        condensed
    }
}
