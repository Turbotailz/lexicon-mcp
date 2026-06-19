# lexicon-mcp

TypeScript [MCP](https://modelcontextprotocol.io) server for the [Lexicon DJ](https://www.lexicondj.com) **Local API** — query and update your library from Cursor, Claude, VS Code, Windsurf, Cline, or any MCP client.

- API docs: [developers/api](https://www.lexicondj.com/docs/developers/api)
- OpenAPI: [api-docs.yaml](https://www.lexicondj.com/developer/api-docs.yaml)

Requires **Lexicon** running with **Settings → Integrations → Local API** enabled (default `http://localhost:48624`).

## Install

No package install required — `npx -y` downloads and runs the server on demand.

Add this server entry to your MCP client (see below for where each client stores its config):

```json
"lexicon": {
  "command": "npx",
  "args": ["-y", "lexicon-mcp"]
}
```

Restart the client after editing (or reload MCP servers where supported). `lexicon-mcp --help` and `lexicon-mcp -v` work in a terminal; the bare command exits with a note (MCP uses stdio pipes).

### Cursor

**Config:** `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project)

```json
{
  "mcpServers": {
    "lexicon": {
      "command": "npx",
      "args": ["-y", "lexicon-mcp"]
    }
  }
}
```

### Claude Desktop

**Config:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows), or `~/.config/Claude/claude_desktop_config.json` (Linux)

Same `mcpServers` format as Cursor. Fully quit and reopen Claude Desktop after saving.

### Claude Code

**CLI** (project scope, writes to `.mcp.json`):

```bash
claude mcp add lexicon -- npx -y lexicon-mcp
```

**CLI with environment variables:**

```bash
claude mcp add -e LEXICON_MCP_ALLOW_WRITES=1 lexicon -- npx -y lexicon-mcp
```

Use `-s user` for a global server across all projects. Config files: `.mcp.json` (project) or `~/.claude.json` (user).

### VS Code / GitHub Copilot

**Config:** `.vscode/mcp.json` (workspace) or user-profile `mcp.json` (run **MCP: Open User Configuration**)

VS Code uses a `servers` key and a `type` field:

```json
{
  "servers": {
    "lexicon": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "lexicon-mcp"]
    }
  }
}
```

### Windsurf

**Config:** `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows)

Same `mcpServers` format as Cursor. Restart Windsurf after saving.

### Cline

**Config:** Cline sidebar → MCP Servers → Configure, or `~/.cline/mcp.json` (CLI). In VS Code/Cursor extensions, settings are stored under the extension's global storage as `cline_mcp_settings.json`.

Same `mcpServers` format as Cursor.

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `LEXICON_HOST` | `localhost` | API host |
| `LEXICON_PORT` | `48624` | API port |
| `LEXICON_URL` | — | Full base URL override |
| `LEXICON_MCP_ALLOW_WRITES` | off | Set to `1` to enable PATCH/POST/DELETE |

Add an `env` block to the server entry (or pass `-e KEY=value` with `claude mcp add`):

**Remote Lexicon** — API on another host:

```json
"env": {
  "LEXICON_HOST": "192.168.1.50",
  "LEXICON_PORT": "48624"
}
```

**Custom URL** — override host/port with a full base URL:

```json
"env": {
  "LEXICON_URL": "http://studio.local:48624"
}
```

**Writes enabled** — allow track updates, playback control, and other mutating API calls:

```json
"env": {
  "LEXICON_MCP_ALLOW_WRITES": "1"
}
```

Example with environment options in Cursor:

```json
{
  "mcpServers": {
    "lexicon": {
      "command": "npx",
      "args": ["-y", "lexicon-mcp"],
      "env": {
        "LEXICON_MCP_ALLOW_WRITES": "1"
      }
    }
  }
}
```

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

## Development

```bash
npm install
npm run build
npm test
npm link   # optional global bin
```
