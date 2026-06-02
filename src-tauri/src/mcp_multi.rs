use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: i32,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub id: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<McpError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpError {
    pub code: i32,
    pub message: String,
}

/// HTTP request timeout for remote MCP servers. The stdio path keeps its own
/// 10s line-read timeout; both surface the same "Request timeout" error.
const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize, Clone)]
struct McpServerConfig {
    #[serde(default)]
    transport: Option<String>,
    #[serde(default)]
    command: Option<String>,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Deserialize)]
struct McpConfig {
    #[serde(rename = "mcpServers")]
    mcp_servers: HashMap<String, McpServerConfig>,
}

struct StdioTransport {
    command: String,
    args: Vec<String>,
    child: Mutex<Option<Child>>,
}

struct HttpTransport {
    url: String,
    headers: HashMap<String, String>,
    client: reqwest::Client,
    session_id: Mutex<Option<String>>,
}

#[derive(Clone)]
enum Transport {
    Stdio(Arc<StdioTransport>),
    Http(Arc<HttpTransport>),
}

#[derive(Clone)]
pub struct McpServer {
    name: String,
    #[allow(dead_code)]
    description: String,
    transport: Transport,
}

impl McpServer {
    pub fn new_stdio(
        name: String,
        description: String,
        command: String,
        args: Vec<String>,
    ) -> Self {
        Self {
            name,
            description,
            transport: Transport::Stdio(Arc::new(StdioTransport {
                command,
                args,
                child: Mutex::new(None),
            })),
        }
    }

    pub fn new_http(
        name: String,
        description: String,
        url: String,
        headers: HashMap<String, String>,
    ) -> Self {
        Self {
            name,
            description,
            transport: Transport::Http(Arc::new(HttpTransport {
                url,
                headers,
                client: reqwest::Client::new(),
                session_id: Mutex::new(None),
            })),
        }
    }

    pub async fn start(&self) -> Result<(), String> {
        match &self.transport {
            Transport::Stdio(inner) => {
                let mut child_guard = inner.child.lock().await;

                if child_guard.is_some() {
                    return Ok(());
                }

                let mut project_root = std::env::current_dir()
                    .map_err(|e| format!("Failed to get current directory: {}", e))?;

                if project_root.ends_with("src-tauri") {
                    project_root.pop();
                }

                let child = Command::new(&inner.command)
                    .args(&inner.args)
                    .current_dir(&project_root)
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to start MCP server '{}': {}", self.name, e))?;

                *child_guard = Some(child);

                drop(child_guard);

                match self.initialize().await {
                    Ok(_) => Ok(()),
                    Err(e) => {
                        let mut child_guard = inner.child.lock().await;
                        if let Some(mut child) = child_guard.take() {
                            let _ = child.kill().await;
                        }
                        Err(e)
                    }
                }
            }
            Transport::Http(_) => self.initialize().await,
        }
    }

    async fn initialize(&self) -> Result<(), String> {
        let init_request = McpRequest {
            jsonrpc: "2.0".to_string(),
            id: 0,
            method: "initialize".to_string(),
            params: Some(serde_json::json!({
                "protocolVersion": "2026-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "openMOON",
                    "version": "1.0.0"
                }
            })),
        };

        let response = self.send_request_internal(init_request).await?;

        if response.error.is_some() {
            return Err(format!("Failed to initialize MCP server '{}'", self.name));
        }

        // Send initialized notification
        let initialized_notification = McpRequest {
            jsonrpc: "2.0".to_string(),
            id: -1,
            method: "notifications/initialized".to_string(),
            params: None,
        };

        let _ = self.send_request_internal(initialized_notification).await;

        Ok(())
    }

    pub async fn send_request(&self, request: McpRequest) -> Result<McpResponse, String> {
        self.send_request_internal(request).await
    }

    async fn send_request_internal(&self, request: McpRequest) -> Result<McpResponse, String> {
        match &self.transport {
            Transport::Stdio(inner) => self.send_stdio(inner, request).await,
            Transport::Http(inner) => self.send_http(inner, request).await,
        }
    }

    async fn send_stdio(
        &self,
        inner: &StdioTransport,
        request: McpRequest,
    ) -> Result<McpResponse, String> {
        let mut child_guard = inner.child.lock().await;

        if let Some(child) = child_guard.as_mut() {
            let request_json = serde_json::to_string(&request)
                .map_err(|e| format!("Failed to serialize request: {}", e))?;

            if let Some(stdin) = child.stdin.as_mut() {
                stdin
                    .write_all(request_json.as_bytes())
                    .await
                    .map_err(|e| format!("Failed to write to stdin: {}", e))?;
                stdin
                    .write_all(b"\n")
                    .await
                    .map_err(|e| format!("Failed to write newline: {}", e))?;
                stdin
                    .flush()
                    .await
                    .map_err(|e| format!("Failed to flush stdin: {}", e))?;
            } else {
                return Err("Stdin not available".to_string());
            }

            if let Some(stdout) = child.stdout.as_mut() {
                let mut reader = BufReader::new(stdout);
                let mut response_line = String::new();

                match tokio::time::timeout(
                    Duration::from_secs(10),
                    reader.read_line(&mut response_line),
                )
                .await
                {
                    Ok(Ok(_)) => {
                        let response: McpResponse =
                            serde_json::from_str(&response_line).map_err(|e| {
                                format!("Failed to parse response: {} | Line: {}", e, response_line)
                            })?;
                        return Ok(response);
                    }
                    Ok(Err(e)) => return Err(format!("Failed to read from stdout: {}", e)),
                    Err(_) => return Err("Request timeout".to_string()),
                }
            }
        }

        Err(format!("MCP server '{}' not started", self.name))
    }

    async fn send_http(
        &self,
        inner: &HttpTransport,
        request: McpRequest,
    ) -> Result<McpResponse, String> {
        let is_notification = request.method.starts_with("notifications/");

        let mut builder = inner
            .client
            .post(&inner.url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header(
                reqwest::header::ACCEPT,
                "application/json, text/event-stream",
            );

        for (key, value) in &inner.headers {
            builder = builder.header(key, value);
        }

        if let Some(session_id) = inner.session_id.lock().await.as_ref() {
            builder = builder.header("Mcp-Session-Id", session_id);
        }

        let response =
            match tokio::time::timeout(HTTP_REQUEST_TIMEOUT, builder.json(&request).send()).await {
                Ok(Ok(resp)) => resp,
                Ok(Err(e)) => return Err(format!("HTTP request failed: {}", e)),
                Err(_) => return Err("Request timeout".to_string()),
            };

        if let Some(session_id) = response
            .headers()
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
        {
            *inner.session_id.lock().await = Some(session_id.to_string());
        }

        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if is_notification {
            return Ok(McpResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: Some(serde_json::json!({})),
                error: None,
            });
        }

        if body.trim().is_empty() {
            if status.is_success() {
                return Ok(McpResponse {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: Some(serde_json::json!({})),
                    error: None,
                });
            }
            return Err(format!(
                "HTTP error {} from MCP server '{}'",
                status, self.name
            ));
        }

        let payload = if content_type.contains("text/event-stream") {
            extract_sse_json(&body)
                .ok_or_else(|| format!("No JSON-RPC payload in SSE stream: {}", body))?
        } else {
            body
        };

        serde_json::from_str::<McpResponse>(&payload)
            .map_err(|e| format!("Failed to parse response: {} | Body: {}", e, payload))
    }

    pub async fn stop(&self) -> Result<(), String> {
        match &self.transport {
            Transport::Stdio(inner) => {
                let mut child_guard = inner.child.lock().await;
                if let Some(mut child) = child_guard.take() {
                    child
                        .kill()
                        .await
                        .map_err(|e| format!("Failed to kill MCP server '{}': {}", self.name, e))?;
                }
            }
            Transport::Http(inner) => {
                *inner.session_id.lock().await = None;
            }
        }

        Ok(())
    }

    pub async fn call_tool(
        &self,
        tool_name: &str,
        params: serde_json::Value,
    ) -> Result<McpResponse, String> {
        let call_request = McpRequest {
            jsonrpc: "2.0".to_string(),
            id: 2,
            method: "tools/call".to_string(),
            params: Some(serde_json::json!({
                "name": tool_name,
                "arguments": params
            })),
        };

        self.send_request_internal(call_request).await
    }
}

pub struct McpManager {
    servers: Arc<Mutex<HashMap<String, McpServer>>>,
    tool_routes: Arc<Mutex<HashMap<String, String>>>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
            tool_routes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn load_from_config(&self, config_path: &str) -> Result<(), String> {
        let config_content = std::fs::read_to_string(config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;

        let config: McpConfig = serde_json::from_str(&config_content)
            .map_err(|e| format!("Failed to parse config: {}", e))?;

        let mut servers_guard = self.servers.lock().await;

        for (name, server_config) in config.mcp_servers {
            if servers_guard.contains_key(&name) {
                continue;
            }
            let server = build_server(name.clone(), server_config)?;
            servers_guard.insert(name, server);
        }

        Ok(())
    }

    pub async fn start_all(&self, config_path: &str) -> Result<String, String> {
        // Reload config so newly added servers are registered before starting.
        self.load_from_config(config_path).await?;

        let servers_guard = self.servers.lock().await;

        // Start all servers in parallel
        let mut handles = Vec::new();

        for (name, server) in servers_guard.iter() {
            let server_clone = server.clone();
            let description = server.description.clone();
            let name_clone = name.clone();

            let handle = tokio::spawn(async move {
                match server_clone.start().await {
                    Ok(_) => Ok(format!("✅ {}: {}", name_clone, description)),
                    Err(e) => Err(format!("❌ {}: {}", name_clone, e)),
                }
            });

            handles.push(handle);
        }

        drop(servers_guard);

        // Wait for all servers to complete with a reasonable delay
        tokio::time::sleep(Duration::from_millis(100)).await;

        let mut started = Vec::new();
        let mut errors = Vec::new();

        for handle in handles {
            match handle.await {
                Ok(Ok(msg)) => started.push(msg),
                Ok(Err(e)) => errors.push(e),
                Err(e) => errors.push(format!("❌ Task error: {}", e)),
            }
        }

        if !errors.is_empty() {
            return Err(errors.join("\n"));
        }

        Ok(format!("MCP Servers started:\n{}", started.join("\n")))
    }

    pub async fn stop_all(&self) -> Result<(), String> {
        let servers_guard = self.servers.lock().await;

        for (_, server) in servers_guard.iter() {
            server.stop().await?;
        }

        Ok(())
    }

    pub async fn list_all_tools(&self) -> Result<serde_json::Value, String> {
        let servers_guard = self.servers.lock().await;
        let mut all_tools = HashMap::new();
        let mut routes = HashMap::new();

        for (name, server) in servers_guard.iter() {
            let list_request = McpRequest {
                jsonrpc: "2.0".to_string(),
                id: 1,
                method: "tools/list".to_string(),
                params: None,
            };

            match server.send_request(list_request).await {
                Ok(response) => {
                    if let Some(result) = response.result {
                        if let Some(tools) = result["tools"].as_array() {
                            for tool in tools {
                                if let Some(tool_name) = tool["name"].as_str() {
                                    routes.insert(tool_name.to_string(), name.clone());
                                }
                            }
                        }
                        all_tools.insert(name.clone(), result);
                    }
                }
                Err(_) => {}
            }
        }

        drop(servers_guard);

        *self.tool_routes.lock().await = routes;

        Ok(serde_json::to_value(all_tools).unwrap())
    }

    #[allow(dead_code)]
    pub async fn call_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        params: serde_json::Value,
    ) -> Result<McpResponse, String> {
        let servers_guard = self.servers.lock().await;

        if let Some(server) = servers_guard.get(server_name) {
            server.call_tool(tool_name, params).await
        } else {
            Err(format!("MCP server '{}' not found", server_name))
        }
    }

    pub async fn find_and_call_tool(
        &self,
        tool_name: &str,
        params: serde_json::Value,
    ) -> Result<(String, McpResponse), String> {
        // O(1) lookup in the routing cache, refreshing once if the tool is unknown
        // (handles servers/tools that were added after the last listing).
        let mut server_name = self.tool_routes.lock().await.get(tool_name).cloned();

        if server_name.is_none() {
            let _ = self.list_all_tools().await;
            server_name = self.tool_routes.lock().await.get(tool_name).cloned();
        }

        let server_name = server_name
            .ok_or_else(|| format!("Tool '{}' not found in any MCP server", tool_name))?;

        let server = {
            let servers_guard = self.servers.lock().await;
            servers_guard.get(&server_name).cloned()
        };

        let server = server.ok_or_else(|| format!("MCP server '{}' not found", server_name))?;

        let call_result = server.call_tool(tool_name, params).await?;

        Ok((server_name, call_result))
    }
}

/// Builds an `McpServer` from a config entry, defaulting to stdio transport when
/// `command` is present and selecting HTTP/SSE when `transport: "http"`/`"sse"`
/// is declared or only a `url` is provided.
fn build_server(name: String, config: McpServerConfig) -> Result<McpServer, String> {
    let transport = config.transport.as_deref();
    let is_http = matches!(transport, Some("http") | Some("sse"))
        || (config.command.is_none() && config.url.is_some());

    if is_http {
        let url = config
            .url
            .map(|u| expand_env(&u))
            .ok_or_else(|| format!("MCP server '{}' uses http transport but has no url", name))?;
        let headers = config
            .headers
            .into_iter()
            .map(|(k, v)| (k, expand_env(&v)))
            .collect();
        Ok(McpServer::new_http(name, config.description, url, headers))
    } else {
        let command = config
            .command
            .map(|c| expand_env(&c))
            .ok_or_else(|| format!("MCP server '{}' has no command for stdio transport", name))?;
        let args = config.args.iter().map(|a| expand_env(a)).collect();
        Ok(McpServer::new_stdio(
            name,
            config.description,
            command,
            args,
        ))
    }
}

/// Expands `${VAR}` placeholders in a config string using process environment
/// variables (loaded from `.env` at startup). Unknown variables expand to an
/// empty string so missing secrets surface as auth errors, not parse failures.
fn expand_env(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;

    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find('}') {
            Some(end) => {
                let var = &after[..end];
                out.push_str(&std::env::var(var).unwrap_or_default());
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
                break;
            }
        }
    }

    out.push_str(rest);
    out
}

/// Extracts the first JSON-RPC response object from a Streamable HTTP SSE body.
/// Concatenates multi-line `data:` payloads per event and returns the first one
/// that parses as a JSON object carrying a `result` or `error` field.
fn extract_sse_json(body: &str) -> Option<String> {
    let mut current = String::new();

    let is_response = |payload: &str| -> bool {
        serde_json::from_str::<serde_json::Value>(payload)
            .ok()
            .map(|v| v.get("result").is_some() || v.get("error").is_some())
            .unwrap_or(false)
    };

    for line in body.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            let chunk = rest.strip_prefix(' ').unwrap_or(rest);
            if !current.is_empty() {
                current.push('\n');
            }
            current.push_str(chunk);
        } else if line.trim().is_empty() {
            if !current.is_empty() {
                if is_response(&current) {
                    return Some(current);
                }
                current.clear();
            }
        }
    }

    if !current.is_empty() && is_response(&current) {
        return Some(current);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_json_from_sse_stream() {
        let body =
            "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"ok\":true}}\n\n";
        let payload = extract_sse_json(body).expect("should find payload");
        let value: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["result"]["ok"], serde_json::json!(true));
    }

    #[test]
    fn skips_non_response_sse_events() {
        let body = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"ping\"}\n\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{}}\n\n";
        let payload = extract_sse_json(body).expect("should find response payload");
        let value: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["id"], serde_json::json!(2));
    }

    #[test]
    fn http_transport_selected_when_url_present() {
        let config = McpServerConfig {
            transport: None,
            command: None,
            args: vec![],
            url: Some("https://example.com/mcp".to_string()),
            headers: HashMap::new(),
            description: "remote".to_string(),
        };
        let server = build_server("remote".to_string(), config).unwrap();
        assert!(matches!(server.transport, Transport::Http(_)));
    }

    #[test]
    fn expands_known_env_var_and_blanks_unknown() {
        std::env::set_var("MOONOS_TEST_TOKEN", "secret123");
        assert_eq!(
            expand_env("Bearer ${MOONOS_TEST_TOKEN}"),
            "Bearer secret123"
        );
        assert_eq!(expand_env("x ${MOONOS_TEST_MISSING} y"), "x  y");
        assert_eq!(expand_env("no placeholder"), "no placeholder");
        assert_eq!(expand_env("unterminated ${OPEN"), "unterminated ${OPEN");
    }

    #[test]
    fn stdio_transport_is_default() {
        let config = McpServerConfig {
            transport: None,
            command: Some("node".to_string()),
            args: vec!["index.js".to_string()],
            url: None,
            headers: HashMap::new(),
            description: "local".to_string(),
        };
        let server = build_server("local".to_string(), config).unwrap();
        assert!(matches!(server.transport, Transport::Stdio(_)));
    }
}
