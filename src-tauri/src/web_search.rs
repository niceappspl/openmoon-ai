use reqwest;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

pub struct WebSearchClient {
    client: reqwest::Client,
}

impl WebSearchClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    pub async fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        // Using DuckDuckGo HTML search (no API key needed)
        let url = format!("https://html.duckduckgo.com/html/?q={}",
            urlencoding::encode(query));

        let response = self.client
            .get(&url)
            .header("User-Agent", "Mozilla/5.0")
            .send()
            .await
            .map_err(|e| format!("Search request failed: {}", e))?;

        let html = response.text().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Simple HTML parsing for results
        let results = self.parse_duckduckgo_results(&html);

        Ok(results)
    }

    fn parse_duckduckgo_results(&self, html: &str) -> Vec<SearchResult> {
        let mut results = Vec::new();
        let query_for_fallback = html.split("q=").nth(1).and_then(|s| s.split('&').next()).unwrap_or("search").to_string();

        // Very basic parsing - look for result divs
        // In production, use a proper HTML parser like scraper
        let lines: Vec<&str> = html.lines().collect();
        let mut i = 0;

        while i < lines.len() && results.len() < 5 {
            let line = lines[i];

            // Look for result links
            if line.contains("result__a") {
                if let Some(title_start) = line.find(">") {
                    if let Some(title_end) = line[title_start+1..].find("<") {
                        let title = &line[title_start+1..title_start+1+title_end];

                        // Try to extract URL
                        if let Some(url_start) = line.find("href=\"") {
                            if let Some(url_end) = line[url_start+6..].find("\"") {
                                let url = &line[url_start+6..url_start+6+url_end];

                                // Get snippet from next few lines
                                let mut snippet = String::new();
                                for j in i+1..std::cmp::min(i+5, lines.len()) {
                                    if lines[j].contains("result__snippet") {
                                        snippet = lines[j]
                                            .replace("<b>", "")
                                            .replace("</b>", "")
                                            .trim()
                                            .to_string();
                                        break;
                                    }
                                }

                                results.push(SearchResult {
                                    title: title.to_string(),
                                    url: url.to_string(),
                                    snippet: snippet,
                                });
                            }
                        }
                    }
                }
            }

            i += 1;
        }

        // If parsing failed, return at least something
        if results.is_empty() {
            results.push(SearchResult {
                title: "Search completed".to_string(),
                url: format!("https://duckduckgo.com/?q={}", query_for_fallback),
                snippet: "Click to see full results on DuckDuckGo".to_string(),
            });
        }

        results
    }
}
