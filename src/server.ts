import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiGet, apiRequest, pairAndDescribe } from "./client.js";
import { assertWritesAllowed } from "./guard.js";
import { errorResult, textResult } from "./mcp-result.js";
import { controlToolDescription, runControl } from "./resources/control.js";
import { getPlaying, getQueue } from "./resources/player.js";
import {
  addPlaylistTracks,
  createPlaylist,
  deletePlaylists,
  flattenPlaylists,
  getPlaylistById,
  getPlaylistByPath,
  getSelectedPlaylistIds,
  listPlaylists,
  removePlaylistTracks,
  updatePlaylist,
} from "./resources/playlists.js";
import {
  createTag,
  createTagCategory,
  deleteTag,
  deleteTagCategory,
  formatTagsByCategory,
  listTags,
  updateTag,
  updateTagCategory,
} from "./resources/tags.js";
import { libraryStats } from "./resources/stats.js";
import {
  addTracks,
  deleteTracks,
  getSelectedTrackIds,
  getTrack,
  listIncoming,
  listTracks,
  ping,
  searchTracks,
  updateTrack,
  updateTrackLocation,
} from "./resources/tracks.js";
import type { HttpMethod } from "./types.js";
import { packageVersion } from "./version.js";

const VERSION = packageVersion();

const httpMethodSchema = z.enum(["GET", "PATCH", "POST", "DELETE"]);

const trackIdSchema = z
  .union([z.number().int().positive(), z.literal("selected")])
  .describe(
    'Track id, or "selected". GET returns the topmost selected track (error 113 if none). PATCH applies the edits to every selected track.',
  );

const trackSourceSchema = z
  .enum(["non-archived", "all", "archived", "incoming"])
  .optional()
  .describe("Which tracks to include. Default non-archived, the same set as the Lexicon track browser.");

const trackFieldsSchema = z
  .array(z.string())
  .optional()
  .describe("Track fields to return. Defaults to a small summary. Fewer fields are faster on large libraries.");

const trackSortSchema = z
  .array(
    z.object({
      field: z.string().describe("Track field to sort on"),
      dir: z.enum(["asc", "desc"]).optional().describe("Direction. Lexicon defaults to asc when omitted."),
    }),
  )
  .max(2)
  .optional()
  .describe("Sort, most significant first (max 2). When omitted, lexicon-mcp sorts by dateAdded descending.");

const playlistTypeSchema = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal("1"), z.literal("2"), z.literal("3")])
  .describe("1 = folder, 2 = playlist, 3 = smartlist");

const smartlistSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    "Smartlist rules, only for type 3. Example: { matchAll: true, rules: [{ field: 'bpm', operator: 'NumberBetween', values: [120, 130] }] }",
  );

const settingsHint =
  "Settings → Local API (Settings → Integrations in v1.11 and older)";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "lexicon-mcp",
    version: VERSION,
  });

  server.tool(
    "lexicon_ping",
    `Check the Lexicon Local API is reachable. Lexicon must be running with the API enabled under ${settingsHint}.`,
    {},
    async () => {
      try {
        const status = await ping();
        return textResult({
          ...status,
          hint: `Enable the API in Lexicon → ${settingsHint}. Default http://localhost:48624. Lexicon v1.12+ can require a token: set LEXICON_TOKEN or run lexicon-mcp pair / lexicon_pair.`,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_pair",
    `Ask Lexicon v1.12+ to approve this app and store the token (POST /v1/auth/pair). Sends { name } from LEXICON_APP_NAME (default lexicon-mcp) and waits up to 2 minutes for the popup. The token is saved to the config file (mode 0600) and is not returned here. LEXICON_TOKEN always overrides that file. A second pair for an app name Lexicon already allowed returns HTTP 409 error 11 — set LEXICON_TOKEN, or remove the app under ${settingsHint} and pair again. Does not require LEXICON_MCP_ALLOW_WRITES.`,
    {},
    async () => {
      try {
        return textResult(await pairAndDescribe());
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
    "lexicon_create_tag",
    "Create a Custom Tag in a category (POST /v1/tag). Requires LEXICON_MCP_ALLOW_WRITES=1. The new tag is returned at the top level of the Lexicon response.",
    {
      categoryId: z.number().int().positive().describe("Category to place the tag in"),
      label: z.string().min(1).describe("Tag label"),
    },
    async ({ categoryId, label }) => {
      try {
        assertWritesAllowed();
        return textResult(await createTag({ categoryId, label }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_update_tag",
    "Update a Custom Tag (PATCH /v1/tag). position must be free in the category (error 108). Moving categoryId places the tag at the end unless position is also free. Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      id: z.number().int().positive(),
      categoryId: z.number().int().positive().optional(),
      label: z.string().min(1).optional(),
      position: z.number().int().min(0).optional().describe("Index inside the category, starting at 0"),
    },
    async ({ id, categoryId, label, position }) => {
      try {
        assertWritesAllowed();
        return textResult(await updateTag({ id, categoryId, label, position }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_delete_tag",
    "Delete a Custom Tag by id (DELETE /v1/tag). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    { id: z.number().int().positive() },
    async ({ id }) => {
      try {
        assertWritesAllowed();
        return textResult(await deleteTag(id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_create_tag_category",
    "Create a Custom Tag category (POST /v1/tag-category). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      label: z.string().min(1),
      color: z.string().optional().describe("Category color, for example #FF00FF"),
    },
    async ({ label, color }) => {
      try {
        assertWritesAllowed();
        return textResult(await createTagCategory({ label, color }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_update_tag_category",
    "Update a Custom Tag category (PATCH /v1/tag-category). A duplicate label is error 107. tags, when sent, must include every tag the category already has (error 5 if one is missing, error 109 if an id is unknown). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      id: z.number().int().positive(),
      label: z.string().min(1).optional(),
      color: z.string().optional(),
      tags: z
        .array(z.number().int().positive())
        .optional()
        .describe("Every tag in this category, in display order"),
      position: z.number().int().min(0).optional().describe("Index among categories, starting at 0"),
    },
    async ({ id, label, color, tags, position }) => {
      try {
        assertWritesAllowed();
        return textResult(await updateTagCategory({ id, label, color, tags, position }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_delete_tag_category",
    "Delete a Custom Tag category and every tag in it (DELETE /v1/tag-category). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    { id: z.number().int().positive() },
    async ({ id }) => {
      try {
        assertWritesAllowed();
        return textResult(await deleteTagCategory(id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_list_tracks",
    "List tracks from the Lexicon library (GET /v1/tracks). Pagination is server-side: limit default 50 (max 1000), offset default 0. source, fields, and sort are forwarded. `total` is the full count, not the page size.",
    {
      limit: z.number().int().min(1).max(1000).optional().describe("Max tracks (default 50, API max 1000)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
      source: trackSourceSchema,
      fields: trackFieldsSchema,
      sort: trackSortSchema,
    },
    async ({ limit, offset, source, fields, sort }) => {
      try {
        const data = await listTracks({ limit, offset, source, fields, sort });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_get_track",
    'Get one track (GET /v1/track). id is a positive integer, or "selected" for the topmost track selected in Lexicon. When several tracks are selected, lexicon_get_selected_tracks returns all of their ids. If nothing is selected, Lexicon returns error 113.',
    { id: trackIdSchema },
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
    "lexicon_get_selected_tracks",
    "Get the ids of the tracks selected in the Lexicon track browser the user last worked in (GET /v1/tracks/selected), in the order Lexicon shows them. ids is empty when nothing is selected or no track browser is open.",
    {},
    async () => {
      try {
        return textResult({ ids: await getSelectedTrackIds() });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_update_track",
    'Update one track, or pass id "selected" to apply the same edits to every track selected in Lexicon (PATCH /v1/track). A relative numeric edit is a string starting with + or -. Error 113 if nothing is selected, and nothing is changed. Requires LEXICON_MCP_ALLOW_WRITES=1.',
    {
      id: trackIdSchema,
      edits: z
        .record(z.unknown())
        .describe('edits object per the Lexicon API, e.g. { tags: [197, 202], title: "..." }'),
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
    "lexicon_add_tracks",
    "Add tracks to the library by file path (POST /v1/tracks). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      locations: z.array(z.string().min(1)).min(1).describe("File paths to add"),
    },
    async ({ locations }) => {
      try {
        assertWritesAllowed();
        return textResult(await addTracks(locations));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_delete_tracks",
    "Delete tracks from the library by id (DELETE /v1/tracks). Does not delete the files. Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      ids: z.array(z.number().int().positive()).min(1),
    },
    async ({ ids }) => {
      try {
        assertWritesAllowed();
        return textResult(await deleteTracks(ids));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_update_track_location",
    "Point a track at a different file (PATCH /v1/track/location). This only changes the library; the file is not moved. Error 110 if another track already uses the location, error 111 if the file is missing (unless checkFileExists is false). Streaming tracks cannot be relocated. Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      id: z.number().int().positive(),
      location: z.string().min(1).describe("Full path to the new file"),
      checkFileExists: z
        .boolean()
        .optional()
        .describe("Require the file to exist on disk. Default true."),
    },
    async ({ id, location, checkFileExists }) => {
      try {
        assertWritesAllowed();
        return textResult(await updateTrackLocation({ id, location, checkFileExists }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_search_tracks",
    `Search tracks (GET /v1/search/tracks). The filter object is ANDed. limit (default 50, max 1000), offset (default 0), source, fields, and sort are forwarded so large libraries stay paginated on the server. \`total\` is the full match count.

Archived and incoming tracks are chosen with source, not the filter.

Examples:
- { "tags": "irh" } — has event tag irh
- { "tags": "!house" } — missing house genre tag
- { "tags": "~house, pop" } — has house AND pop
- { "artist": "Daft Punk" }
- { "location": "*DJ-incoming*" }`,
    {
      filter: z.record(z.unknown()).describe("Lexicon search filter object"),
      limit: z.number().int().min(1).max(1000).optional().describe("Page size (default 50, API max 1000)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
      source: trackSourceSchema,
      fields: trackFieldsSchema,
      sort: trackSortSchema,
    },
    async ({ filter, limit, offset, source, fields, sort }) => {
      try {
        const data = await searchTracks({ filter, limit, offset, source, fields, sort });
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
    "lexicon_get_selected_playlists",
    "Get the ids of playlists, smartlists, and folders selected in the Lexicon playlist tree (GET /v1/playlists/selected). A selected folder is listed by its own id, not the playlists inside it. The root folder is never listed. ids is empty when nothing is selected.",
    {},
    async () => {
      try {
        return textResult({ ids: await getSelectedPlaylistIds() });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_create_playlist",
    "Create a playlist, folder, or smartlist (POST /v1/playlist). Requires LEXICON_MCP_ALLOW_WRITES=1. Omit parentId to add at the bottom of the tree.",
    {
      name: z.string().min(1),
      type: playlistTypeSchema,
      parentId: z.number().int().positive().optional(),
      smartlist: smartlistSchema,
    },
    async ({ name, type, parentId, smartlist }) => {
      try {
        assertWritesAllowed();
        return textResult(await createPlaylist({ name, type, parentId, smartlist }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_update_playlist",
    "Update a playlist name, parent, position, or smartlist rules (PATCH /v1/playlist). The root folder cannot be changed (error 112). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      id: z.number().int().positive(),
      name: z.string().min(1).optional(),
      parentId: z.number().int().positive().optional().describe("Folder to move the playlist into"),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Index inside the parent, starting at 0"),
      smartlist: smartlistSchema,
    },
    async ({ id, name, parentId, position, smartlist }) => {
      try {
        assertWritesAllowed();
        return textResult(await updatePlaylist({ id, name, parentId, position, smartlist }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_delete_playlists",
    "Delete playlists by id (DELETE /v1/playlists). If ids includes the root folder, Lexicon rejects the whole request with error 112 and deletes nothing. Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      ids: z.array(z.number().int().positive()).min(1),
    },
    async ({ ids }) => {
      try {
        assertWritesAllowed();
        return textResult(await deletePlaylists(ids));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_add_playlist_tracks",
    "Add tracks to a playlist (PATCH /v1/playlist-tracks). Omit index to append. Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      id: z.number().int().positive().describe("Playlist id"),
      trackIds: z.array(z.number().int().positive()).min(1),
      index: z.number().int().min(0).optional().describe("Insert position. Omit to append."),
    },
    async ({ id, trackIds, index }) => {
      try {
        assertWritesAllowed();
        return textResult(await addPlaylistTracks({ id, trackIds, index }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_remove_playlist_tracks",
    "Remove tracks from a playlist (DELETE /v1/playlist-tracks). Requires LEXICON_MCP_ALLOW_WRITES=1.",
    {
      id: z.number().int().positive().describe("Playlist id"),
      trackIds: z.array(z.number().int().positive()).min(1),
    },
    async ({ id, trackIds }) => {
      try {
        assertWritesAllowed();
        return textResult(await removePlaylistTracks({ id, trackIds }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "lexicon_control",
    controlToolDescription,
    {
      action: z
        .string()
        .describe("Any Lexicon control action name, including future and GhostCurator_* actions"),
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
    "Call any Lexicon /v1 endpoint (GET, PATCH, POST, DELETE). See https://www.lexicondj.com/developer/api-docs.yaml. Auth headers are applied automatically. Non-GET requires LEXICON_MCP_ALLOW_WRITES=1.",
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
