import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiGet, apiRequest } from "./client.js";
import { assertWritesAllowed } from "./guard.js";
import { errorResult, textResult } from "./mcp-result.js";
import { runControl } from "./resources/control.js";
import { getPlaying, getQueue } from "./resources/player.js";
import {
  flattenPlaylists,
  getPlaylistById,
  getPlaylistByPath,
  listPlaylists,
} from "./resources/playlists.js";
import { formatTagsByCategory, listTags } from "./resources/tags.js";
import { libraryStats } from "./resources/stats.js";
import {
  getTrack,
  listIncoming,
  listTracks,
  ping,
  searchTracks,
  updateTrack,
} from "./resources/tracks.js";
import type { HttpMethod } from "./types.js";

const VERSION = "0.2.0";

const httpMethodSchema = z.enum(["GET", "PATCH", "POST", "DELETE"]);

export function createServer(): McpServer {
  const server = new McpServer({
    name: "lexicon-mcp",
    version: VERSION,
  });

  server.tool(
    "lexicon_ping",
    "Check Lexicon Local API is reachable (Lexicon app must be running with API enabled under Settings → Integrations).",
    {},
    async () => {
      try {
        const status = await ping();
        return textResult({
          ...status,
          hint: "Enable API in Lexicon → Settings → Integrations. Default http://localhost:48624",
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_list_tags",
    "List My Tag categories and tags from Lexicon (Genre, Vibe, Event, Role, etc.).",
    {},
    async () => {
      try {
        const data = await listTags();
        return textResult({ categories: formatTagsByCategory(data) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_list_tracks",
    "List tracks from the Lexicon library (paginated, newest first).",
    {
      limit: z.number().int().min(1).max(1000).optional().describe("Max tracks (default 50)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
    async ({ limit, offset }) => {
      try {
        const data = await listTracks({ limit: limit ?? 50, offset: offset ?? 0 });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_get_track",
    "Get one track by ID (full payload: tags, cuepoints, tempomarkers, etc.).",
    {
      id: z.number().int().positive().describe("Track ID"),
    },
    async ({ id }) => {
      try {
        const track = await getTrack(id);
        if (!track) return textResult({ error: `Track ${id} not found` });
        return textResult({ track });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_update_track",
    "Update one track (tags, metadata, cuepoints, incoming flag). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      id: z.number().int().positive(),
      edits: z
        .record(z.unknown())
        .describe("edits object per Lexicon API, e.g. { tags: [197, 202], title: \"...\" }"),
    },
    async ({ id, edits }) => {
      try {
        assertWritesAllowed();
        const data = await updateTrack(id, edits);
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_search_tracks",
    `Search tracks using Lexicon filters. Examples:
- { "tags": "irh" } — has event tag irh
- { "tags": "!house" } — missing house genre tag
- { "tags": "~house, pop" } — has house AND pop
- { "artist": "Daft Punk" }
- { "location": "*DJ-incoming*" }`,
    {
      filter: z.record(z.unknown()).describe("Lexicon search filter object"),
    },
    async ({ filter }) => {
      try {
        const data = await searchTracks({ filter });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_list_incoming",
    "List tracks in the Incoming queue or under DJ-incoming watch folder.",
    {
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ limit }) => {
      try {
        return textResult(await listIncoming({ limit }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_library_stats",
    "Summarize library health: totals, incoming, tracks without a Genre tag.",
    {
      sampleLimit: z.number().int().min(100).max(2000).optional(),
    },
    async ({ sampleLimit }) => {
      try {
        return textResult(await libraryStats({ sampleLimit: sampleLimit ?? 500 }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_list_playlists",
    "List playlist tree from Lexicon (folders, playlists, smart playlists).",
    {},
    async () => {
      try {
        const tree = await listPlaylists();
        return textResult({ playlists: flattenPlaylists(tree) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_get_playlist",
    "Get one playlist by ID or by path (path survives library re-import).",
    {
      id: z.number().int().positive().optional(),
      path: z.array(z.string()).optional().describe('e.g. ["IRH", "Peak"]'),
      type: z
        .union([z.string(), z.number()])
        .optional()
        .describe("Playlist type when using path: 1=folder, 2=playlist, 3=smartlist"),
    },
    async ({ id, path, type }) => {
      try {
        if (id != null) return textResult(await getPlaylistById(id));
        if (path?.length) return textResult(await getPlaylistByPath(path, type));
        return textResult({ error: "Provide id or path" });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_control",
    "Run a Lexicon control action (e.g. Incoming_SelectedDone, Application_Tags_AddShortcut). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      action: z.string().describe("Control action name from Lexicon API docs"),
      parameters: z.record(z.unknown()).optional(),
    },
    async ({ action, parameters }) => {
      try {
        assertWritesAllowed();
        return textResult(await runControl(action, parameters));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_get_playing",
    "Get the currently playing track and player progress.",
    {},
    async () => {
      try {
        return textResult(await getPlaying());
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_get_queue",
    "Get the player queue (excluding the current track).",
    {},
    async () => {
      try {
        return textResult(await getQueue());
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_request",
    "Call any Lexicon /v1 endpoint (GET, PATCH, POST, DELETE). See https://www.lexicondj.com/developer/api-docs.yaml. Non-GET requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      method: httpMethodSchema,
      path: z.string().describe("Must start with /v1/, e.g. /v1/track"),
      body: z.record(z.unknown()).optional(),
    },
    async ({ method, path, body }) => {
      try {
        if (method !== "GET") assertWritesAllowed();
        const data = await apiRequest(method as HttpMethod, path, body);
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // Deprecated alias — GET-only for backwards compatibility
  server.tool(
    "lexicon_raw_request",
    "Deprecated: use lexicon_request with method GET. Call any Lexicon /v1 path with JSON body.",
    {
      path: z.string(),
      body: z.record(z.unknown()).optional(),
    },
    async ({ path, body }) => {
      try {
        const data = await apiGet(path, body ?? {});
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
