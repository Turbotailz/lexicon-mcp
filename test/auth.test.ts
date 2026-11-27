import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { describe, it } from "node:test";
import { PAIR_TIMEOUT_MS, apiGet, pairAndDescribe } from "../src/client.js";
import { formatApiError, tokenFilePath } from "../src/auth.js";
import { getTrack, listTracks, searchTracks } from "../src/resources/tracks.js";
import { jsonBody, withMock } from "./helpers.js";

const SECRET = "super-secret-token-value";

function ok(data: unknown = { ok: true }) {
  return { status: 200, json: { data } };
}

describe("auth headers", { concurrency: false }, () => {
  it("sends X-Lexicon-App and no Authorization when no token is configured", async () => {
    await withMock(
      () => ok({ categories: [], tags: [] }),
      async (mock) => {
        await apiGet("/v1/tags", {});
        const req = mock.seen[0]!;
        assert.equal(req.headers["x-lexicon-app"], "lexicon-mcp");
        assert.equal(req.headers.authorization, undefined);
      },
    );
  });

  it("uses LEXICON_APP_NAME and LEXICON_TOKEN", async () => {
    await withMock(
      () => ok(),
      async (mock) => {
        await apiGet("/v1/tags", {});
        const req = mock.seen[0]!;
        assert.equal(req.headers["x-lexicon-app"], "studio-deck");
        assert.equal(req.headers.authorization, `Bearer ${SECRET}`);
      },
      { LEXICON_APP_NAME: "studio-deck", LEXICON_TOKEN: SECRET },
    );
  });

  it("prefers LEXICON_TOKEN over a stored token for a different value", async () => {
    await withMock(
      () => ok(),
      async (mock) => {
        const { saveToken } = await import("../src/auth.js");
        saveToken("stored-token-value-xyz", "lexicon-mcp");
        await apiGet("/v1/tags", {});
        assert.equal(mock.seen[0]?.headers.authorization, `Bearer ${SECRET}`);
      },
      { LEXICON_TOKEN: SECRET },
    );
  });

  it("uses the stored token when LEXICON_TOKEN is unset", async () => {
    await withMock(
      () => ok(),
      async (mock) => {
        const { saveToken } = await import("../src/auth.js");
        saveToken(SECRET, "lexicon-mcp");
        await apiGet("/v1/tags", {});
        assert.equal(mock.seen[0]?.headers.authorization, `Bearer ${SECRET}`);
        assert.equal(statSync(tokenFilePath()).mode & 0o777, 0o600);
        assert.equal(statSync(dirname(tokenFilePath())).mode & 0o777, 0o700);
      },
    );
  });

  it("ignores a stored token for a different app name", async () => {
    await withMock(
      () => ok(),
      async (mock) => {
        const { saveToken } = await import("../src/auth.js");
        saveToken(SECRET, "other-app");
        await apiGet("/v1/tags", {});
        assert.equal(mock.seen[0]?.headers.authorization, undefined);
      },
    );
  });

  it("treats an empty LEXICON_TOKEN as unset and falls back to the file", async () => {
    await withMock(
      () => ok(),
      async (mock) => {
        const { saveToken } = await import("../src/auth.js");
        saveToken(SECRET, "lexicon-mcp");
        await apiGet("/v1/tags", {});
        assert.equal(mock.seen[0]?.headers.authorization, `Bearer ${SECRET}`);
      },
      { LEXICON_TOKEN: "   " },
    );
  });

  it("rejects header values that contain a newline before sending a request", async () => {
    await withMock(
      () => ok(),
      async (mock) => {
        process.env.LEXICON_APP_NAME = "bad\nname";
        await assert.rejects(() => apiGet("/v1/tags", {}), /newline/);
        delete process.env.LEXICON_APP_NAME;
        process.env.LEXICON_TOKEN = "bad\ntoken-value";
        await assert.rejects(() => apiGet("/v1/tags", {}), (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /newline/);
          assert.equal(err.message.includes("bad\ntoken-value"), false);
          return true;
        });
        assert.equal(mock.seen.length, 0);
      },
    );
  });

  it("keeps working with no token when Lexicon does not require one", async () => {
    await withMock(
      () => ok({ categories: [{ id: 1, label: "Genre" }], tags: [] }),
      async () => {
        const { listTags } = await import("../src/resources/tags.js");
        const tags = await listTags();
        assert.equal(tags.categories.length, 1);
      },
    );
  });
});

describe("pairing", { concurrency: false }, () => {
  it("waits long enough for the two minute approval window", () => {
    assert.ok(PAIR_TIMEOUT_MS >= 120_000);
  });

  it("stores the body token with mode 0600 and does not reveal it", async () => {
    const token = "paired-token-value-001";
    await withMock(
      () => ({
        status: 200,
        json: { data: { token } },
        headers: { "X-Lexicon-Token": token },
      }),
      async (mock) => {
        const message = await pairAndDescribe();
        assert.equal(message.includes(token), false);
        assert.match(message, /0600/);
        assert.match(message, /LEXICON_TOKEN always takes precedence/);
        assert.match(message, /Settings → Local API/);
        const req = mock.seen[0]!;
        assert.equal(req.method, "POST");
        assert.equal(req.url, "/v1/auth/pair");
        assert.equal(req.headers["x-lexicon-app"], "lexicon-mcp");
        assert.equal(req.headers.authorization, undefined);
        assert.deepEqual(jsonBody(req), { name: "lexicon-mcp" });
        const fileMode = statSync(tokenFilePath()).mode & 0o777;
        const dirMode = statSync(tokenFilePath().replace(/token\.json$/, "")).mode & 0o777;
        assert.equal(fileMode, 0o600);
        assert.equal(dirMode, 0o700);
        const stored = JSON.parse(readFileSync(tokenFilePath(), "utf8")) as {
          appName: string;
          token: string;
        };
        assert.deepEqual(stored, { appName: "lexicon-mcp", token });

        await apiGet("/v1/tags", {});
        assert.equal(mock.seen[1]?.headers.authorization, `Bearer ${token}`);
      },
    );
  });

  it("omits Authorization on pair even when LEXICON_TOKEN is set, and keeps using the env token", async () => {
    const paired = "newly-paired-token-value";
    await withMock(
      (req) => {
        if (req.url === "/v1/auth/pair") {
          return { status: 200, json: { data: { token: paired } } };
        }
        return ok();
      },
      async (mock) => {
        const message = await pairAndDescribe();
        assert.equal(message.includes(paired), false);
        assert.equal(message.includes(SECRET), false);
        assert.match(message, /LEXICON_TOKEN is set/);
        assert.equal(mock.seen[0]?.headers.authorization, undefined);
        await apiGet("/v1/tags", {});
        assert.equal(mock.seen[1]?.headers.authorization, `Bearer ${SECRET}`);
      },
      { LEXICON_TOKEN: SECRET },
    );
  });

  it("captures X-Lexicon-Token when the body has no token", async () => {
    const token = "header-only-token-value";
    await withMock(
      () => ({
        status: 200,
        json: { data: {} },
        headers: { "X-Lexicon-Token": token },
      }),
      async () => {
        const message = await pairAndDescribe();
        assert.equal(message.includes(token), false);
        const stored = JSON.parse(readFileSync(tokenFilePath(), "utf8")) as { token: string };
        assert.equal(stored.token, token);
      },
    );
  });

  it("prefers the body token over a different response header", async () => {
    await withMock(
      () => ({
        status: 200,
        json: { data: { token: "body-token-bbbbbbbb" } },
        headers: { "X-Lexicon-Token": "header-token-aaaaaaaa" },
      }),
      async () => {
        await pairAndDescribe();
        const stored = JSON.parse(readFileSync(tokenFilePath(), "utf8")) as { token: string };
        assert.equal(stored.token, "body-token-bbbbbbbb");
      },
    );
  });

  it("saves X-Lexicon-Token from a successful API response for later requests", async () => {
    const token = "approved-during-request";
    await withMock(
      (req) => {
        if (req.headers.authorization) {
          return { status: 200, json: { data: { ids: [] } } };
        }
        return {
          status: 200,
          json: { data: { ids: [] } },
          headers: { "X-Lexicon-Token": token },
        };
      },
      async (mock) => {
        const { getSelectedTrackIds } = await import("../src/resources/tracks.js");
        await getSelectedTrackIds();
        assert.equal(mock.seen[0]?.headers.authorization, undefined);
        await getSelectedTrackIds();
        assert.equal(mock.seen[1]?.headers.authorization, `Bearer ${token}`);
      },
    );
  });

  it("does not store a token from an error response", async () => {
    await withMock(
      () => ({
        status: 401,
        json: { errorCode: 9, message: `bad ${SECRET}` },
        headers: { "X-Lexicon-Token": SECRET },
      }),
      async () => {
        await assert.rejects(() => apiGet("/v1/tags", {}), (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message.includes(SECRET), false);
          assert.match(err.message, /error 9/);
          return true;
        });
        assert.equal(existsSync(tokenFilePath()), false);
      },
    );
  });

  it("times out a hung pairing request without waiting two minutes", async () => {
    await withMock(
      () => ({ hang: true }),
      async () => {
        const started = Date.now();
        await assert.rejects(
          () => pairAndDescribe({ timeoutMs: 400 }),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /2 minutes/);
            assert.match(err.message, /Settings → Local API/);
            assert.equal(err.message.includes(SECRET), false);
            return true;
          },
        );
        const elapsed = Date.now() - started;
        assert.ok(elapsed < 5_000, `pairing hung for ${elapsed}ms`);
      },
    );
  });
});

describe("auth error codes", { concurrency: false }, () => {
  const cases: Array<{ code: number; status: number; match: RegExp }> = [
    { code: 6, status: 403, match: /blocked/i },
    { code: 9, status: 401, match: /LEXICON_TOKEN/ },
    { code: 10, status: 401, match: /approval/i },
    { code: 11, status: 409, match: /already allowed/i },
    { code: 12, status: 413, match: /too large/i },
  ];

  for (const entry of cases) {
    it(`formats error ${entry.code} without leaking the token`, async () => {
      await withMock(
        () => ({
          status: entry.status,
          json: { errorCode: entry.code, message: `leaked ${SECRET}` },
        }),
        async () => {
          await assert.rejects(() => apiGet("/v1/tags", {}), (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, entry.match);
            assert.match(err.message, new RegExp(`error ${entry.code}`));
            if (entry.code !== 12) assert.match(err.message, /Settings → Local API/);
            assert.equal(err.message.includes(SECRET), false);
            assert.match(err.message, /\[redacted\]/);
            return true;
          });
        },
        { LEXICON_APP_NAME: "studio-deck", LEXICON_TOKEN: SECRET },
      );
    });
  }

  it("formats error 12 without requiring a settings path", () => {
    const message = formatApiError({ errorCode: 12, statusCode: 413, appName: "lexicon-mcp" });
    assert.match(message, /413/);
    assert.match(message, /64 KB/);
    assert.match(message, /100 MB/);
  });

  it("formats error 113 from GET /v1/track id=selected", async () => {
    await withMock(
      (req) => {
        assert.equal(req.url, "/v1/track");
        assert.equal(jsonBody(req).id, "selected");
        return {
          status: 400,
          json: { errorCode: 113, message: `none ${SECRET}` },
        };
      },
      async () => {
        await assert.rejects(() => getTrack("selected"), (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /No track is selected/);
          assert.match(err.message, /113/);
          assert.equal(err.message.includes(SECRET), false);
          return true;
        });
      },
      { LEXICON_TOKEN: SECRET },
    );
  });

  it("redacts a token embedded in an invalid JSON body", async () => {
    await withMock(
      () => ({
        status: 200,
        raw: `nope {"token":"${SECRET}"} Bearer ${SECRET}`,
      }),
      async () => {
        await assert.rejects(() => apiGet("/v1/tags", {}), (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /Invalid JSON/);
          assert.equal(err.message.includes(SECRET), false);
          return true;
        });
      },
      { LEXICON_TOKEN: SECRET },
    );
  });
});

describe("query parameters", { concurrency: false }, () => {
  it("forwards source, fields, and sort for list and search, including defaults", async () => {
    await withMock(
      () => ok({ total: 2, tracks: [] }),
      async (mock) => {
        await listTracks();
        await listTracks({
          limit: 10,
          offset: 20,
          source: "incoming",
          fields: ["id", "title"],
          sort: [
            { field: "bpm", dir: "asc" },
            { field: "title", dir: "desc" },
          ],
        });
        await searchTracks({ filter: { artist: "Daft Punk" } });
        await searchTracks({
          filter: { tags: "~house, pop" },
          limit: 5,
          offset: 15,
          source: "all",
          fields: ["id", "bpm"],
          sort: [{ field: "energy", dir: "desc" }],
        });

        const listDefault = jsonBody(mock.seen[0]!);
        assert.equal(listDefault.limit, 50);
        assert.equal(listDefault.offset, 0);
        assert.equal(listDefault.source, "non-archived");
        assert.deepEqual(listDefault.fields, [
          "id",
          "title",
          "artist",
          "albumTitle",
          "bpm",
          "key",
          "genre",
          "location",
          "incoming",
          "tags",
          "dateAdded",
        ]);
        assert.deepEqual(listDefault.sort, [{ field: "dateAdded", dir: "desc" }]);

        const listCustom = jsonBody(mock.seen[1]!);
        assert.deepEqual(listCustom, {
          limit: 10,
          offset: 20,
          source: "incoming",
          fields: ["id", "title"],
          sort: [
            { field: "bpm", dir: "asc" },
            { field: "title", dir: "desc" },
          ],
        });

        const searchDefault = jsonBody(mock.seen[2]!);
        assert.equal(searchDefault.limit, 50);
        assert.equal(searchDefault.offset, 0);
        assert.equal(searchDefault.source, "non-archived");
        assert.deepEqual(searchDefault.filter, { artist: "Daft Punk" });
        assert.deepEqual(searchDefault.fields, [
          "id",
          "title",
          "artist",
          "bpm",
          "key",
          "genre",
          "location",
          "tags",
          "incoming",
        ]);
        assert.deepEqual(searchDefault.sort, [{ field: "dateAdded", dir: "desc" }]);

        const searchCustom = jsonBody(mock.seen[3]!);
        assert.deepEqual(searchCustom, {
          source: "all",
          filter: { tags: "~house, pop" },
          fields: ["id", "bpm"],
          sort: [{ field: "energy", dir: "desc" }],
          limit: 5,
          offset: 15,
        });
      },
    );
  });
});
