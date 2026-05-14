---
name: xingyun-search
description: Web search using XingYun OpenSearch via web_fetch. Use the built-in web_search tool first; this skill documents the direct HTTP API fallback for environments where tool instructions are needed. Provides titles, URLs, and snippets for research queries.
---

# XingYun OpenSearch

Search the web using the XingYun OpenSearch JSON API.

## How to Search

```
web_fetch(url="https://opensearch.xing-yun.cn/search?q=QUERY&format=json", headers={"X-API-Key":"${XINGYUN_OPENSEARCH_API_KEY}"}, extractMode="text", maxChars=8000)
```

- URL-encode the query — use `+` for spaces
- Include `format=json`
- Include the `X-API-Key` header
- Increase `maxChars` for more results

## Reading Results

The JSON response contains a top-level `results` array. Each result usually includes:

- `title`
- `url`
- `content`
- `engine`

## Search-then-Fetch Pattern

1. **Search** — query XingYun OpenSearch for a list of results
2. **Pick** — identify the most relevant URLs
3. **Fetch** — use `web_fetch` on those URLs to read full content

## Tips

- For exact phrases, wrap in quotes and URL-encode the query
- Add specific terms to narrow results (site name, year, location)

## Limitations

- Uses XingYun OpenSearch
- Results depend on the configured OpenSearch backend engines
