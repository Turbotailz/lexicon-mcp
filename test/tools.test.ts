import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { tokenFilePath } from "../src/auth.js";
import { packageVersion } from "../src/version.js";
import { jsonBody, resultText, withMcp, withMock } from "./helpers.js";

const SECRET = "super-secret-token-value";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readRepo(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("server metadata", { concurrency: false }, () => {
  it("reports the package.json version", async () => {
    const pkg = JSON.parse(readRepo("package.json")) as { version: string };
    assert.equal(packageVersion(), pkg.version);
    assert.equal(readRepo("src/server.ts").includes('VERSION = "0.2.0"'), false);
    await withMcp(async (client) => {
      assert.equal(client.getServerVersion()?.version, pkg.version);
      assert.equal(client.getServerVersion()?.name, "lexicon-mcp");
    });
  });

  it("documents Ghost Curator actions and keeps control actions open", async () => {
    await withMcp(async (client) => {
      const listed = await client.listTools();
      const names = new Set(listed.tools.map((tool) => tool.name));
      for (const name of [
        "lexicon_pair",
        "lexicon_get_selected_tracks",
        "lexicon_get_selected_playlists",
        "lexicon_create_playlist",
        "lexicon_update_playlist",
        "lexicon_delete_playlists",
        "lexicon_add_playlist_tracks",
        "lexicon_remove_playlist_tracks",
        "lexicon_create_tag",
        "lexicon_update_tag",
        "lexicon_delete_tag",
        "lexicon_create_tag_category",
        "lexicon_update_tag_category",
        "lexicon_delete_tag_category",
        "lexicon_add_tracks",
        "lexicon_delete_tracks",
        "lexicon_update_track_location",
      ]) {
        assert.equal(names.has(name), true, name);
      }
      const control = listed.tools.find((tool) => tool.name === "lexicon_control");
      assert.ok(control?.description);
      for (const action of [
        "GhostCurator_ToggleFollow",
        "GhostCurator_ToggleOverlay",
        "GhostCurator_RollDice",
        "GhostCurator_UseSuggestion1",
        "GhostCurator_SelectDeck",
        "GhostCurator_NextDeck",
        "GhostCurator_SetEnergyDirection",
        "GhostCurator_SetMinRating",
        "GhostCurator_SwitchMode",
        "GhostCurator_ToggleQuickTag",
        "GhostCurator_LoadSuggestion",
      ]) {
        assert.equal(control.description.includes(action), true, action);
      }
      const actionSchema = control.inputSchema.properties?.action as { type?: string; enum?: unknown };
      assert.equal(actionSchema.type, "string");
      assert.equal(actionSchema.enum, undefined);
    });
  });

  it("points settings paths at Settings → Local API", () => {
    for (const path of ["README.md", "bin/cli.ts", "src/server.ts"]) {
      assert.equal(
        readRepo(path).includes("Settings → Integrations → Local API"),
        false,
        path,
      );
      assert.equal(readRepo(path).includes("Settings → Local API"), true, path);
    }
  });
});

const writeCalls: Array<{
  name: string;
  arguments: Record<string, unknown>;
  method: string;
  path: string;
  body: Record<string, unknown>;
}> = [
  {
    name: "lexicon_create_playlist",
    arguments: { name: "Peak", type: 2, parentId: 9 },
    method: "POST",
    path: "/v1/playlist",
    body: { name: "Peak", type: 2, parentId: 9 },
  },
  {
    name: "lexicon_update_playlist",
    arguments: { id: 4, position: 0 },
    method: "PATCH",
    path: "/v1/playlist",
    body: { id: 4, position: 0 },
  },
  {
    name: "lexicon_delete_playlists",
    arguments: { ids: [4, 5] },
    method: "DELETE",
    path: "/v1/playlists",
    body: { ids: [4, 5] },
  },
  {
    name: "lexicon_add_playlist_tracks",
    arguments: { id: 4, trackIds: [8, 9], index: 0 },
    method: "PATCH",
    path: "/v1/playlist-tracks",
    body: { id: 4, trackIds: [8, 9], index: 0 },
  },
  {
    name: "lexicon_remove_playlist_tracks",
    arguments: { id: 4, trackIds: [8] },
    method: "DELETE",
    path: "/v1/playlist-tracks",
    body: { id: 4, trackIds: [8] },
  },
  {
    name: "lexicon_create_tag",
    arguments: { categoryId: 2, label: "Vocals" },
    method: "POST",
    path: "/v1/tag",
    body: { categoryId: 2, label: "Vocals" },
  },
  {
    name: "lexicon_update_tag",
    arguments: { id: 7, label: "Vox", position: 1 },
    method: "PATCH",
    path: "/v1/tag",
    body: { id: 7, label: "Vox", position: 1 },
  },
  {
    name: "lexicon_delete_tag",
    arguments: { id: 7 },
    method: "DELETE",
    path: "/v1/tag",
    body: { id: 7 },
  },
  {
    name: "lexicon_create_tag_category",
    arguments: { label: "Genre", color: "#FF00FF" },
    method: "POST",
    path: "/v1/tag-category",
    body: { label: "Genre", color: "#FF00FF" },
  },
  {
    name: "lexicon_update_tag_category",
    arguments: { id: 3, tags: [1, 2], position: 0 },
    method: "PATCH",
    path: "/v1/tag-category",
    body: { id: 3, tags: [1, 2], position: 0 },
  },
  {
    name: "lexicon_delete_tag_category",
    arguments: { id: 3 },
    method: "DELETE",
    path: "/v1/tag-category",
    body: { id: 3 },
  },
  {
    name: "lexicon_add_tracks",
    arguments: { locations: ["/music/a.mp3"] },
    method: "POST",
    path: "/v1/tracks",
    body: { locations: ["/music/a.mp3"] },
  },
  {
    name: "lexicon_delete_tracks",
    arguments: { ids: [11, 12] },
    method: "DELETE",
    path: "/v1/tracks",
    body: { ids: [11, 12] },
  },
  {
    name: "lexicon_update_track_location",
    arguments: { id: 11, location: "/music/b.mp3", checkFileExists: false },
    method: "PATCH",
    path: "/v1/track/location",
    body: { id: 11, location: "/music/b.mp3", checkFileExists: false },
  },
  {
    name: "lexicon_update_track",
    arguments: { id: "selected", edits: { rating: 5 } },
    method: "PATCH",
    path: "/v1/track",
    body: { id: "selected", edits: { rating: 5 } },
  },
  {
    name: "lexicon_control",
    arguments: { action: "GhostCurator_LoadSuggestion", parameters: { index: 0, deckNumber: 1 } },
    method: "POST",
    path: "/v1/control",
    body: { action: "GhostCurator_LoadSuggestion", parameters: { index: 0, deckNumber: 1 } },
  },
];

describe("tools", { concurrency: false }, () => {
  it("blocks every mutating tool until writes are enabled", async () => {
    await withMock(
      () => ({ status: 200, json: { data: {} } }),
      async (mock) => {
        await withMcp(async (client) => {
          for (const call of writeCalls) {
            const result = await client.callTool({ name: call.name, arguments: call.arguments });
            const text = resultText(result);
            assert.match(text, /LEXICON_MCP_ALLOW_WRITES/, call.name);
          }
          const post = await client.callTool({
            name: "lexicon_request",
            arguments: { method: "POST", path: "/v1/playlist", body: { name: "X", type: 2 } },
          });
          assert.match(resultText(post), /LEXICON_MCP_ALLOW_WRITES/);
        });
        assert.equal(mock.seen.length, 0);
      },
    );
  });

  it("forwards write tools when LEXICON_MCP_ALLOW_WRITES=1", async () => {
    await withMock(
      () => ({ status: 200, json: { data: { id: 1 } } }),
      async (mock) => {
        await withMcp(async (client) => {
          for (const call of writeCalls) {
            const result = await client.callTool({ name: call.name, arguments: call.arguments });
            const text = resultText(result);
            assert.equal(text.includes("LEXICON_MCP_ALLOW_WRITES"), false, text);
            const req = mock.seen.at(-1);
            assert.equal(req?.method, call.method, call.name);
            assert.equal(req?.url, call.path, call.name);
            assert.deepEqual(jsonBody(req!), call.body, call.name);
            assert.equal(req?.headers["x-lexicon-app"], "lexicon-mcp", call.name);
            assert.equal(req?.headers.authorization, `Bearer ${SECRET}`, call.name);
          }
        });
      },
      { LEXICON_MCP_ALLOW_WRITES: "1", LEXICON_TOKEN: SECRET },
    );
  });

  it("reads the selection and accepts id selected", async () => {
    await withMock(
      (req) => {
        if (req.url === "/v1/tracks/selected") return { status: 200, json: { data: { ids: [12, 7] } } };
        if (req.url === "/v1/playlists/selected") return { status: 200, json: { data: { ids: [4] } } };
        if (req.url === "/v1/track") return { status: 200, json: { data: { track: { id: 12, title: "Top" } } } };
        return { status: 404, json: { errorCode: 4, message: req.url } };
      },
      async (mock) => {
        await withMcp(async (client) => {
          const tracks = JSON.parse(resultText(await client.callTool({
            name: "lexicon_get_selected_tracks",
            arguments: {},
          }))) as { ids: number[] };
          assert.deepEqual(tracks.ids, [12, 7]);

          const playlists = JSON.parse(resultText(await client.callTool({
            name: "lexicon_get_selected_playlists",
            arguments: {},
          }))) as { ids: number[] };
          assert.deepEqual(playlists.ids, [4]);

          const track = JSON.parse(resultText(await client.callTool({
            name: "lexicon_get_track",
            arguments: { id: "selected" },
          }))) as { track: { id: number; title: string } };
          assert.deepEqual(track.track, { id: 12, title: "Top" });
        });
        assert.equal(mock.seen[0]?.url, "/v1/tracks/selected");
        assert.equal(mock.seen[1]?.url, "/v1/playlists/selected");
        assert.equal(mock.seen[2]?.url, "/v1/track");
        assert.equal(jsonBody(mock.seen[2]!).id, "selected");
        assert.equal(mock.seen[2]?.headers.authorization, undefined);
      },
    );
  });

  it("returns a clean error 113 from lexicon_get_track", async () => {
    await withMock(
      () => ({ status: 400, json: { errorCode: 113, message: `none ${SECRET}` } }),
      async () => {
        await withMcp(async (client) => {
          const text = resultText(await client.callTool({
            name: "lexicon_get_track",
            arguments: { id: "selected" },
          }));
          assert.match(text, /No track is selected/);
          assert.match(text, /113/);
          assert.equal(text.includes(SECRET), false);
        });
      },
      { LEXICON_TOKEN: SECRET },
    );
  });

  it("forwards list and search query fields from the tools", async () => {
    await withMock(
      () => ({ status: 200, json: { data: { total: 0, tracks: [] } } }),
      async (mock) => {
        await withMcp(async (client) => {
          await client.callTool({
            name: "lexicon_list_tracks",
            arguments: {
              limit: 10,
              offset: 20,
              source: "archived",
              fields: ["id", "artist"],
              sort: [{ field: "artist", dir: "asc" }],
            },
          });
          await client.callTool({
            name: "lexicon_search_tracks",
            arguments: {
              filter: { bpm: ">=120" },
              limit: 5,
              offset: 15,
              source: "all",
              fields: ["id", "bpm"],
              sort: [{ field: "bpm", dir: "desc" }],
            },
          });
          await client.callTool({
            name: "lexicon_search_tracks",
            arguments: { filter: { artist: "Daft Punk" } },
          });
        });
        assert.deepEqual(jsonBody(mock.seen[0]!), {
          limit: 10,
          offset: 20,
          source: "archived",
          fields: ["id", "artist"],
          sort: [{ field: "artist", dir: "asc" }],
        });
        assert.deepEqual(jsonBody(mock.seen[1]!), {
          source: "all",
          filter: { bpm: ">=120" },
          fields: ["id", "bpm"],
          sort: [{ field: "bpm", dir: "desc" }],
          limit: 5,
          offset: 15,
        });
        const searchDefault = jsonBody(mock.seen[2]!);
        assert.equal(searchDefault.limit, 50);
        assert.equal(searchDefault.offset, 0);
        assert.equal(searchDefault.source, "non-archived");
        assert.deepEqual(searchDefault.filter, { artist: "Daft Punk" });
      },
    );
  });

  it("pairs without the write flag and does not return the token", async () => {
    const token = "paired-token-value-001";
    await withMock(
      () => ({
        status: 200,
        json: { data: { token } },
        headers: { "X-Lexicon-Token": token },
      }),
      async () => {
        await withMcp(async (client) => {
          const text = resultText(await client.callTool({ name: "lexicon_pair", arguments: {} }));
          assert.match(text, /Paired/);
          assert.equal(text.includes(token), false);
          const stored = JSON.parse(readFileSync(tokenFilePath(), "utf8")) as { token: string };
          assert.equal(stored.token, token);
        });
      },
    );
  });
});
