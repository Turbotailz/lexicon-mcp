# lexicon-mcp

TypeScript [MCP](https://modelcontextprotocol.io) server for the [Lexicon DJ](https://www.lexicondj.com) **Local API** — query and update your library from Cursor, Claude, VS Code, Windsurf, Cline, or any MCP client.

- API docs: [developers/api](https://www.lexicondj.com/docs/developers/api)
- OpenAPI: [api-docs.yaml](https://www.lexicondj.com/developer/api-docs.yaml)

Requires **Lexicon** running with **Settings → Local API** enabled (Settings → Integrations in v1.11 and older). Default `http://localhost:48624`.

Lexicon **v1.12+** identifies each app and can require a token. Lexicon **v1.11 and older** do not. See [Authentication](#authentication).

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
claude mcp add -e LEXICON_TOKEN=your-token -e LEXICON_MCP_ALLOW_WRITES=1 lexicon -- npx -y lexicon-mcp
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

## Authentication

Starting in Lexicon v1.12, every request sends `X-Lexicon-App`. The default name is `lexicon-mcp` (`LEXICON_APP_NAME` overrides it, 64 characters max). When a token is configured, requests also send `Authorization: Bearer`.

Lexicon v1.11 and older ignore these headers. Leave `LEXICON_TOKEN` unset and the server behaves as before.

### API token from Lexicon

1. Open **Settings → Local API** (Settings → Integrations in v1.11 and older) and enable the API.
2. Copy the API token.
3. Set `LEXICON_TOKEN` on the MCP server.

`LEXICON_TOKEN` always wins over a token saved by pairing.

### Pair this app

Lexicon shows an approval popup **once per app name**. The request waits up to **2 minutes**.

```bash
npx lexicon-mcp pair
```

Or call the `lexicon_pair` MCP tool (it does not require `LEXICON_MCP_ALLOW_WRITES`).

When you approve the app, Lexicon returns `{ "data": { "token": "…" } }` and the same value in the `X-Lexicon-Token` response header. lexicon-mcp stores it at `$XDG_CONFIG_HOME/lexicon-mcp/token.json` (or `~/.config/lexicon-mcp/token.json`) with mode `0600`. The token is not printed and is not included in errors. Pairing does not send `Authorization`, so a stale `LEXICON_TOKEN` cannot turn the popup into error 9. After a successful pair, `LEXICON_TOKEN` still overrides the file until you unset it.

```json
{ "appName": "lexicon-mcp", "token": "…" }
```

A stored token is used only when `LEXICON_TOKEN` is unset and the stored `appName` matches `LEXICON_APP_NAME`. A later successful response that carries `X-Lexicon-Token` updates that file the same way.

If the app name is already allowed, Lexicon does not ask again: the pair request returns **HTTP 409** with `errorCode: 11`. Set `LEXICON_TOKEN`, or remove the app under **Settings → Local API** and pair again. Lexicon only stores a hash of the token, so it cannot show the original later.

Other v1.12 auth errors:

| Code | HTTP | Meaning |
|------|------|---------|
| 6 | 403 | App is blocked. Allow it under Settings → Local API, then pair again. (v1.11 and older used HTTP 401 for "app not allowed".) |
| 9 | 401 | Token or app name missing or wrong, and Lexicon did not ask. Set `LEXICON_APP_NAME` / `LEXICON_TOKEN`, or pair. |
| 10 | 401 | Approval popup is still open, or it was closed. Approve it, or pair again. After a dismissal Lexicon waits about a minute before asking again. |
| 11 | 409 | This app name is already allowed and the request had no token. |
| 12 | 413 | Body too large (64 KB from another device before the app is allowed in, 100 MB otherwise). |

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `LEXICON_HOST` | `localhost` | API host |
| `LEXICON_PORT` | `48624` | API port |
| `LEXICON_URL` | — | Full base URL override |
| `LEXICON_APP_NAME` | `lexicon-mcp` | `X-Lexicon-App` value (max 64 characters) |
| `LEXICON_TOKEN` | — | `Authorization: Bearer` token. Overrides the paired token file |
| `LEXICON_CONFIG_DIR` | `~/.config/lexicon-mcp` | Directory for `token.json` (`XDG_CONFIG_HOME` is honored) |
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

**v1.12 token and writes** — library edits plus the API token from Settings → Local API:

```json
"env": {
  "LEXICON_TOKEN": "paste-token-here",
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
        "LEXICON_TOKEN": "paste-token-here",
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
| `lexicon_pair` | POST `/v1/auth/pair` (stores the token, does not return it) |
| `lexicon_list_tags` | GET `/v1/tags` |
| `lexicon_list_tracks` | GET `/v1/tracks` (`limit`, `offset`, `source`, `fields`, `sort`) |
| `lexicon_get_track` | GET `/v1/track` (`id` or `"selected"`) |
| `lexicon_get_selected_tracks` | GET `/v1/tracks/selected` |
| `lexicon_search_tracks` | GET `/v1/search/tracks` (`filter`, `limit`, `offset`, `source`, `fields`, `sort`) |
| `lexicon_list_incoming` | filtered incoming backlog |
| `lexicon_library_stats` | composed stats |
| `lexicon_list_playlists` | GET `/v1/playlists` |
| `lexicon_get_playlist` | GET `/v1/playlist` or `/v1/playlist-by-path` |
| `lexicon_get_selected_playlists` | GET `/v1/playlists/selected` |
| `lexicon_get_playing` | GET `/v1/playing` |
| `lexicon_get_queue` | GET `/v1/queue` |

`lexicon_list_tracks` and `lexicon_search_tracks` page on the server. `limit` defaults to 50 (max 1000) and `offset` defaults to 0 so a large library is not pulled into the chat. `source` defaults to `non-archived`. `total` is the full match count. `fields` defaults to a short summary; pass the fields you need. `sort` defaults to `dateAdded` descending (max two sort keys).

`lexicon_get_track` with `id: "selected"` returns the topmost selected track. Error 113 means nothing is selected.

### Write (requires `LEXICON_MCP_ALLOW_WRITES=1`)

| Tool | API |
|------|-----|
| `lexicon_update_track` | PATCH `/v1/track` (`id` or `"selected"` for every selected track) |
| `lexicon_add_tracks` | POST `/v1/tracks` |
| `lexicon_delete_tracks` | DELETE `/v1/tracks` |
| `lexicon_update_track_location` | PATCH `/v1/track/location` |
| `lexicon_create_playlist` | POST `/v1/playlist` |
| `lexicon_update_playlist` | PATCH `/v1/playlist` |
| `lexicon_delete_playlists` | DELETE `/v1/playlists` |
| `lexicon_add_playlist_tracks` | PATCH `/v1/playlist-tracks` |
| `lexicon_remove_playlist_tracks` | DELETE `/v1/playlist-tracks` |
| `lexicon_create_tag` | POST `/v1/tag` |
| `lexicon_update_tag` | PATCH `/v1/tag` |
| `lexicon_delete_tag` | DELETE `/v1/tag` |
| `lexicon_create_tag_category` | POST `/v1/tag-category` |
| `lexicon_update_tag_category` | PATCH `/v1/tag-category` |
| `lexicon_delete_tag_category` | DELETE `/v1/tag-category` |
| `lexicon_control` | POST `/v1/control` |
| `lexicon_request` | any `/v1/*` method |

`lexicon_update_track` with `id: "selected"` edits **every** selected track. A numeric field sent as a string starting with `+` or `-` changes that field relative to each track's own value. Error 113 changes nothing.

`lexicon_control` accepts any action name, so actions added in later Lexicon versions keep working. Ghost Curator (v1.12.4):

```json
{ "action": "GhostCurator_LoadSuggestion", "parameters": { "index": 0, "deckNumber": 1 } }
```

```json
{ "action": "GhostCurator_SetEnergyDirection", "parameters": { "direction": "Up" } }
```

```json
{ "action": "GhostCurator_SwitchMode", "parameters": { "mode": "manual" } }
```

| Action | Parameters |
|--------|------------|
| `GhostCurator_ToggleFollow`, `GhostCurator_ToggleOverlay`, `GhostCurator_RollDice` | none |
| `GhostCurator_UseSuggestion1`, `GhostCurator_UseSuggestion2`, `GhostCurator_UseSuggestion3` | none |
| `GhostCurator_SelectDeck` | `deckNumber` (1-based). Nothing happens if that deck is not followed |
| `GhostCurator_SelectDeck1` … `GhostCurator_SelectDeck4` | shortcuts for decks 1–4 |
| `GhostCurator_NextDeck`, `GhostCurator_PreviousDeck` | wrap around the decks |
| `GhostCurator_SetEnergyDirection` | `direction`: `Any`, `Up`, `Flat`, or `Down` |
| `GhostCurator_SetEnergyDirection_Up` / `_Flat` / `_Down` / `_Any` | shortcuts |
| `GhostCurator_SetMinRating` | `amount` 0–5 (`0` turns the rating rule off) |
| `GhostCurator_SetMinRating0` … `GhostCurator_SetMinRating5` | shortcuts |
| `GhostCurator_SwitchMode` | optional `mode`: `manual` (My rules) or `crowd` (DJ picks). Omit to toggle |
| `GhostCurator_ToggleQuickTag` | `tagId` |
| `GhostCurator_LoadSuggestion` | `index` (0-based) and `deckNumber` (1-based) |

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
