# lexicon-mcp

TypeScript [MCP](https://modelcontextprotocol.io) server for the [Lexicon DJ](https://www.lexicondj.com) **Local API** — query and update your library from Cursor, Claude Desktop, or any MCP client.

- API docs: [developers/api](https://www.lexicondj.com/docs/developers/api)
- OpenAPI: [api-docs.yaml](https://www.lexicondj.com/developer/api-docs.yaml)

Requires **Lexicon** running with **Settings → Integrations → Local API** enabled (default `http://localhost:48624`).

## Install

```bash
npx lexicon-mcp
```

After `npm link` from a clone:

```json
{
  "mcpServers": {
    "lexicon": {
      "command": "lexicon-mcp"
    }
  }
}
```

Local development:

```json
{
  "mcpServers": {
    "lexicon": {
      "command": "node",
      "args": ["/absolute/path/to/lexicon-mcp/dist/bin/cli.js"]
    }
  }
}
```

Run `npm run build` after pulling changes. Restart Cursor to reload MCP tools.

`lexicon-mcp --help` and `lexicon-mcp -v` work in a terminal; the bare command exits with a note (MCP uses stdio pipes).

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `LEXICON_HOST` | `localhost` | API host |
| `LEXICON_PORT` | `48624` | API port |
| `LEXICON_URL` | — | Full base URL override |
| `LEXICON_MCP_ALLOW_WRITES` | off | Set to `1` to enable PATCH/POST/DELETE |

## Tools

### Read (always on)

| Tool | API |
|------|-----|
| `lexicon_ping` | health + track count |
| `lexicon_list_tags` | GET `/v1/tags` |
| `lexicon_list_tracks` | GET `/v1/tracks` |
| `lexicon_get_track` | GET `/v1/track` |
| `lexicon_search_tracks` | GET `/v1/search/tracks` |
| `lexicon_list_incoming` | filtered incoming backlog |
| `lexicon_library_stats` | composed stats |
| `lexicon_list_playlists` | GET `/v1/playlists` |
| `lexicon_get_playlist` | GET `/v1/playlist` or `/v1/playlist-by-path` |
| `lexicon_get_playing` | GET `/v1/playing` |
| `lexicon_get_queue` | GET `/v1/queue` |

### Write (requires `LEXICON_MCP_ALLOW_WRITES=1`)

| Tool | API |
|------|-----|
| `lexicon_update_track` | PATCH `/v1/track` |
| `lexicon_control` | POST `/v1/control` |
| `lexicon_request` | any `/v1/*` method |

### Escape hatch

| Tool | Notes |
|------|--------|
| `lexicon_request` | Full API — prefer this over deprecated `lexicon_raw_request` |
| `lexicon_raw_request` | GET only (deprecated) |

### Search filter examples

```json
{ "tags": "irh" }
{ "tags": "!house" }
{ "tags": "~house, handbag" }
{ "artist": "Lady Gaga" }
{ "location": "*DJ-incoming*" }
```

### Control examples (writes enabled)

```json
{ "action": "Incoming_SelectedDone" }
{ "action": "Application_Tags_AddShortcut", "parameters": { "amount": 1 } }
```

## Development

```bash
npm install
npm run build
npm test
npm link   # optional global bin
```

## Publish

```bash
npm login
npm publish --access public
```

## License

MIT
