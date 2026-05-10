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
use tokio_util::sync::CancellationToken;

pub static EXTENSION_NAME: &str = "web_search";
const DEFAULT_MAX_RESULTS: usize = 8;
const MAX_RESULTS_LIMIT: usize = 20;
const SEARCH_TIMEOUT_SECS: u64 = 20;

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

        Ok(Self { info, http })
    }

    fn get_tools() -> Vec<Tool> {
        let schema = schema_for!(WebSearchParams);
        let schema_value =
            serde_json::to_value(schema).expect("Failed to serialize WebSearchParams schema");

        vec![Tool::new(
            "search".to_string(),
            indoc! {r#"
                Search the web using DuckDuckGo Lite without requiring an API key.

                Parameters:
                - query: Search query.
                - max_results: Optional number of results to return, 1 to 20. Defaults to 8.
                - region: Optional DuckDuckGo region code, such as us-en, uk-en, de-de, fr-fr, or cn-zh.
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
        let mut url = format!(
            "https://lite.duckduckgo.com/lite/?q={}",
            urlencoding::encode(query)
        );
        if let Some(region) = params
            .region
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            url.push_str("&kl=");
            url.push_str(&urlencoding::encode(region));
        }

        let html = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|error| format!("DuckDuckGo request failed: {error}"))?
            .error_for_status()
            .map_err(|error| format!("DuckDuckGo returned an error: {error}"))?
            .text()
            .await
            .map_err(|error| format!("Failed to read DuckDuckGo response: {error}"))?;

        let results = parse_duckduckgo_lite_results(&html, max_results);
        if results.is_empty() {
            return Ok(format!(
                "No DuckDuckGo results found for `{query}`. Try a broader query."
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
    let mut output = format!("DuckDuckGo search results for `{query}`:\n\n");
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

fn parse_duckduckgo_lite_results(html: &str, max_results: usize) -> Vec<SearchResult> {
    let anchors = extract_anchors(html);
    let mut results = Vec::new();

    for (position, anchor) in anchors.iter().enumerate() {
        let Some(url) = normalize_result_url(&anchor.href) else {
            continue;
        };
        if is_duckduckgo_internal_url(&url) {
            continue;
        }

        let title = clean_text(&anchor.text);
        if title.is_empty()
            || results
                .iter()
                .any(|result: &SearchResult| result.url == url)
        {
            continue;
        }

        let snippet_html =
            html_between_anchor_and_next_anchor(html, anchor.end, anchors.get(position + 1));
        results.push(SearchResult {
            title,
            url,
            snippet: clean_snippet(snippet_html),
        });

        if results.len() >= max_results {
            break;
        }
    }

    results
}

#[derive(Debug)]
struct Anchor {
    href: String,
    text: String,
    start: usize,
    end: usize,
}

fn extract_anchors(html: &str) -> Vec<Anchor> {
    let mut anchors = Vec::new();
    let mut offset = 0;

    while let Some(relative_start) = html[offset..].find("<a") {
        let start = offset + relative_start;
        let Some(open_relative_end) = html[start..].find('>') else {
            break;
        };
        let open_end = start + open_relative_end + 1;
        let Some(close_relative_start) = html[open_end..].find("</a>") else {
            break;
        };
        let close_start = open_end + close_relative_start;
        let end = close_start + "</a>".len();
        let tag = &html[start..open_end];

        if let Some(href) = extract_attr(tag, "href") {
            anchors.push(Anchor {
                href,
                text: html[open_end..close_start].to_string(),
                start,
                end,
            });
        }

        offset = end;
    }

    anchors
}

fn html_between_anchor_and_next_anchor<'a>(
    html: &'a str,
    start: usize,
    next: Option<&Anchor>,
) -> &'a str {
    let end = next
        .map(|anchor| anchor.start)
        .unwrap_or_else(|| (start + 1200).min(html.len()));
    &html[start..end]
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let quoted = format!("{attr}=\"");
    if let Some(start) = tag.find(&quoted).map(|index| index + quoted.len()) {
        let end = tag[start..].find('"')?;
        return Some(html_unescape(&tag[start..start + end]));
    }

    let single_quoted = format!("{attr}='");
    let start = tag
        .find(&single_quoted)
        .map(|index| index + single_quoted.len())?;
    let end = tag[start..].find('\'')?;
    Some(html_unescape(&tag[start..start + end]))
}

fn normalize_result_url(raw_url: &str) -> Option<String> {
    let raw_url = raw_url.replace("&amp;", "&");
    if let Some(start) = raw_url.find("uddg=") {
        let encoded = &raw_url[start + "uddg=".len()..];
        let encoded = encoded.split('&').next().unwrap_or(encoded);
        return urlencoding::decode(encoded)
            .ok()
            .map(|url| url.into_owned());
    }
    if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
        return Some(raw_url);
    }
    None
}

fn is_duckduckgo_internal_url(url: &str) -> bool {
    url.contains("duckduckgo.com") || url.contains("duck.com")
}

fn clean_snippet(html: &str) -> String {
    let text = clean_text(html);
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(|ch: char| ch == '-' || ch == '|' || ch.is_whitespace())
        .to_string()
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
    fn parses_duckduckgo_redirect_results() {
        let html = r#"
            <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;rut=abc">Example Docs</a>
            <td class="result-snippet">Useful documentation &amp; examples.</td>
            <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fblog">Example Blog</a>
            <td class="result-snippet">A blog post.</td>
        "#;

        let results = parse_duckduckgo_lite_results(html, 10);

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Example Docs");
        assert_eq!(results[0].url, "https://example.com/docs");
        assert!(results[0]
            .snippet
            .contains("Useful documentation & examples."));
    }

    #[test]
    fn skips_duckduckgo_internal_links() {
        let html = r#"
            <a href="https://duckduckgo.com/settings">Settings</a>
            <a href="https://example.com">Example</a>
        "#;

        let results = parse_duckduckgo_lite_results(html, 10);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].url, "https://example.com");
    }

    #[test]
    fn respects_max_results() {
        let html = r#"
            <a href="https://example.com/1">One</a>
            <a href="https://example.com/2">Two</a>
        "#;

        let results = parse_duckduckgo_lite_results(html, 1);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "One");
    }
}
