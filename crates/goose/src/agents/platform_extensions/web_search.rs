use crate::agents::extension::PlatformExtensionContext;
use crate::agents::mcp_client::{Error, McpClientTrait};
use crate::agents::tool_execution::ToolCallContext;
use anyhow::Result;
use async_trait::async_trait;
use indoc::indoc;
use rmcp::model::{
    CallToolResult, Content, Implementation, InitializeResult, JsonObject, ListToolsResult,
    ServerCapabilities, Tool, ToolAnnotations,
};
use schemars::{schema_for, JsonSchema};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tokio_util::sync::CancellationToken;

pub static EXTENSION_NAME: &str = "web_search";
const DEFAULT_MAX_RESULTS: usize = 8;
const MAX_RESULTS_LIMIT: usize = 20;
const SEARCH_TIMEOUT_SECS: u64 = 20;
const DEFAULT_SEARCH_ENDPOINT: &str = "https://opensearch.xing-yun.cn/search";
const SEARCH_ENDPOINT_ENV: &str = "XINGYUN_OPENSEARCH_URL";
const SEARCH_API_KEY_ENV: &str = "XINGYUN_OPENSEARCH_API_KEY";
const DEFAULT_SEARCH_API_KEY: &str = "3a933f4de3a641a31279221fb1055298";

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
struct WebSearchParams {
    query: String,
    max_results: Option<usize>,
    region: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

pub struct WebSearchClient {
    info: InitializeResult,
    http: reqwest::Client,
    endpoint: String,
    api_key: Option<String>,
}

impl WebSearchClient {
    pub fn new(_context: PlatformExtensionContext) -> Result<Self> {
        let info = InitializeResult::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(
                Implementation::new(EXTENSION_NAME.to_string(), "1.0.0".to_string())
                    .with_title("Web Search"),
            )
            .with_instructions(
                indoc! {r#"
                Use web_search to find current web pages when the user asks about recent information,
                public facts, documentation, products, companies, or anything that may require web research.

                Search results include title, URL, and snippet. Fetch the most relevant URLs with other available tools when full page details are needed.
            "#}
                .to_string(),
            );
        let http = reqwest::Client::builder()
            .user_agent("XingYunAI/1.0 web_search")
            .timeout(std::time::Duration::from_secs(SEARCH_TIMEOUT_SECS))
            .build()?;
        let endpoint = search_setting(SEARCH_ENDPOINT_ENV)
            .unwrap_or_else(|| DEFAULT_SEARCH_ENDPOINT.to_string());
        let api_key = search_setting(SEARCH_API_KEY_ENV)
            .or_else(|| non_empty(DEFAULT_SEARCH_API_KEY.to_string()));

        Ok(Self {
            info,
            http,
            endpoint,
            api_key,
        })
    }

    fn get_tools() -> Vec<Tool> {
        let schema = schema_for!(WebSearchParams);
        let schema_value =
            serde_json::to_value(schema).expect("Failed to serialize WebSearchParams schema");

        vec![Tool::new(
            "search".to_string(),
            indoc! {r#"
                Search the web using XingYun OpenSearch.

                Parameters:
                - query: Search query.
                - max_results: Optional number of results to return, 1 to 20. Defaults to 8.
                - region: Optional language or region hint passed through to the search backend.
            "#}
            .to_string(),
            schema_value.as_object().unwrap().clone(),
        )
        .annotate(ToolAnnotations::from_raw(
            Some("Web Search".to_string()),
            Some(true),
            Some(false),
            Some(true),
            Some(true),
        ))]
    }

    async fn handle_search(&self, arguments: Option<JsonObject>) -> Result<String, String> {
        let params = parse_args(arguments)?;
        let query = params.query.trim();
        if query.is_empty() {
            return Err("Missing required parameter: query".to_string());
        }

        let max_results = params
            .max_results
            .unwrap_or(DEFAULT_MAX_RESULTS)
            .clamp(1, MAX_RESULTS_LIMIT);
        let api_key = self.api_key.as_deref().ok_or_else(|| {
            format!("Missing required environment variable: {SEARCH_API_KEY_ENV}")
        })?;

        let mut url = format!(
            "{}{}q={}&format=json",
            self.endpoint,
            endpoint_separator(&self.endpoint),
            urlencoding::encode(query)
        );
        if let Some(region) = params
            .region
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            url.push_str("&language=");
            url.push_str(&urlencoding::encode(region));
        }

        let response = self
            .http
            .get(url)
            .header("X-API-Key", api_key)
            .send()
            .await
            .map_err(|error| format!("XingYun OpenSearch request failed: {error}"))?
            .error_for_status()
            .map_err(|error| format!("XingYun OpenSearch returned an error: {error}"))?
            .json::<OpenSearchResponse>()
            .await
            .map_err(|error| format!("Failed to parse XingYun OpenSearch response: {error}"))?;

        let results = parse_opensearch_results(response, max_results);
        if results.is_empty() {
            return Ok(format!(
                "No XingYun OpenSearch results found for `{query}`. Try a broader query."
            ));
        }

        Ok(format_results(query, &results))
    }
}

fn parse_args(arguments: Option<JsonObject>) -> Result<WebSearchParams, String> {
    let value = arguments
        .map(serde_json::Value::Object)
        .ok_or_else(|| "Missing arguments".to_string())?;
    serde_json::from_value(value).map_err(|error| format!("Failed to parse arguments: {error}"))
}

fn format_results(query: &str, results: &[SearchResult]) -> String {
    let mut output = format!("XingYun OpenSearch results for `{query}`:\n\n");
    for (index, result) in results.iter().enumerate() {
        output.push_str(&format!(
            "{}. {}\n   URL: {}\n",
            index + 1,
            result.title,
            result.url
        ));
        if !result.snippet.is_empty() {
            output.push_str(&format!("   Snippet: {}\n", result.snippet));
        }
        output.push('\n');
    }
    output
}

fn endpoint_separator(endpoint: &str) -> &'static str {
    if endpoint.contains('?') {
        "&"
    } else {
        "?"
    }
}

fn search_setting(name: &str) -> Option<String> {
    std::env::var(name).ok().and_then(non_empty).or_else(|| {
        search_env_files()
            .into_iter()
            .find_map(|path| read_env_file_value(&path, name))
    })
}

fn search_env_files() -> Vec<PathBuf> {
    let mut paths = vec![PathBuf::from(".env")];
    if let Some(config_dir) = dirs::config_dir() {
        paths.push(config_dir.join("codemindx").join(".env"));
        paths.push(config_dir.join("goose").join(".env"));
    }
    paths
}

fn read_env_file_value(path: &Path, name: &str) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    contents.lines().find_map(|line| parse_env_line(line, name))
}

fn parse_env_line(line: &str, name: &str) -> Option<String> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    let (key, value) = line.split_once('=')?;
    if key.trim() != name {
        return None;
    }

    let value = value
        .trim()
        .trim_matches(|ch| ch == '"' || ch == '\'')
        .to_string();
    non_empty(value)
}

fn non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

#[derive(Debug, Deserialize)]
struct OpenSearchResponse {
    results: Vec<OpenSearchResult>,
}

#[derive(Debug, Deserialize)]
struct OpenSearchResult {
    title: Option<String>,
    url: Option<String>,
    content: Option<String>,
}

fn parse_opensearch_results(response: OpenSearchResponse, max_results: usize) -> Vec<SearchResult> {
    let mut results = Vec::new();
    let mut seen_urls = HashSet::new();

    for result in response.results {
        let title = result.title.unwrap_or_default().trim().to_string();
        let url = result.url.unwrap_or_default().trim().to_string();
        if title.is_empty() || url.is_empty() || !seen_urls.insert(url.clone()) {
            continue;
        }

        results.push(SearchResult {
            title,
            url,
            snippet: clean_text(&result.content.unwrap_or_default()),
        });

        if results.len() >= max_results {
            break;
        }
    }

    results
}

fn clean_text(html: &str) -> String {
    let mut text = String::new();
    let mut inside_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => {
                inside_tag = false;
                text.push(' ');
            }
            _ if !inside_tag => text.push(ch),
            _ => {}
        }
    }
    html_unescape(&text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn html_unescape(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

#[async_trait]
impl McpClientTrait for WebSearchClient {
    async fn list_tools(
        &self,
        _session_id: &str,
        _next_cursor: Option<String>,
        _cancellation_token: CancellationToken,
    ) -> Result<ListToolsResult, Error> {
        Ok(ListToolsResult {
            tools: Self::get_tools(),
            next_cursor: None,
            meta: None,
        })
    }

    async fn call_tool(
        &self,
        _ctx: &ToolCallContext,
        name: &str,
        arguments: Option<JsonObject>,
        _cancellation_token: CancellationToken,
    ) -> Result<CallToolResult, Error> {
        let result = match name {
            "search" => self.handle_search(arguments).await,
            _ => Err(format!("Unknown tool: {name}")),
        };

        match result {
            Ok(output) => Ok(CallToolResult::success(vec![Content::text(output)])),
            Err(error) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error: {error}"
            ))])),
        }
    }

    fn get_info(&self) -> Option<&InitializeResult> {
        Some(&self.info)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_opensearch_results() {
        let response = OpenSearchResponse {
            results: vec![
                OpenSearchResult {
                    title: Some("Example Docs".to_string()),
                    url: Some("https://example.com/docs".to_string()),
                    content: Some("Useful documentation &amp; examples.".to_string()),
                },
                OpenSearchResult {
                    title: Some("Example Blog".to_string()),
                    url: Some("https://example.org/blog".to_string()),
                    content: Some("A blog post.".to_string()),
                },
            ],
        };

        let results = parse_opensearch_results(response, 10);

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Example Docs");
        assert_eq!(results[0].url, "https://example.com/docs");
        assert!(results[0]
            .snippet
            .contains("Useful documentation & examples."));
    }

    #[test]
    fn skips_invalid_and_duplicate_results() {
        let response = OpenSearchResponse {
            results: vec![
                OpenSearchResult {
                    title: Some("".to_string()),
                    url: Some("https://example.com/empty-title".to_string()),
                    content: None,
                },
                OpenSearchResult {
                    title: Some("Example".to_string()),
                    url: Some("https://example.com".to_string()),
                    content: None,
                },
                OpenSearchResult {
                    title: Some("Example Duplicate".to_string()),
                    url: Some("https://example.com".to_string()),
                    content: None,
                },
            ],
        };

        let results = parse_opensearch_results(response, 10);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].url, "https://example.com");
    }

    #[test]
    fn respects_max_results() {
        let response = OpenSearchResponse {
            results: vec![
                OpenSearchResult {
                    title: Some("One".to_string()),
                    url: Some("https://example.com/1".to_string()),
                    content: None,
                },
                OpenSearchResult {
                    title: Some("Two".to_string()),
                    url: Some("https://example.com/2".to_string()),
                    content: None,
                },
            ],
        };

        let results = parse_opensearch_results(response, 1);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "One");
    }

    #[test]
    fn parses_env_file_values() {
        assert_eq!(
            parse_env_line("XINGYUN_OPENSEARCH_API_KEY='test-key'", SEARCH_API_KEY_ENV),
            Some("test-key".to_string())
        );
        assert_eq!(
            parse_env_line(
                "XINGYUN_OPENSEARCH_URL=\"https://example.com/search\"",
                SEARCH_ENDPOINT_ENV
            ),
            Some("https://example.com/search".to_string())
        );
        assert_eq!(
            parse_env_line("# XINGYUN_OPENSEARCH_API_KEY=nope", SEARCH_API_KEY_ENV),
            None
        );
    }
}
