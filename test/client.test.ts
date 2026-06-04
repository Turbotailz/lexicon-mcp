import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ping } from "../src/resources/tracks.js";
import { listTags } from "../src/resources/tags.js";
import { writesAllowed, assertWritesAllowed } from "../src/guard.js";

describe("guard", () => {
  it("writes disabled by default", () => {
    const prev = process.env.LEXICON_MCP_ALLOW_WRITES;
    delete process.env.LEXICON_MCP_ALLOW_WRITES;
    assert.equal(writesAllowed(), false);
    assert.throws(() => assertWritesAllowed());
    if (prev) process.env.LEXICON_MCP_ALLOW_WRITES = prev;
  });
});

describe("lexicon client (requires Lexicon running)", () => {
  it("ping", async () => {
    try {
      const r = await ping();
      assert.equal(r.ok, true);
      assert.ok((r.trackCount ?? 0) > 0);
    } catch (e) {
      if (String(e).includes("ECONNREFUSED")) return;
      throw e;
    }
  });

  it("listTags", async () => {
    try {
      const r = await listTags();
      assert.ok(Array.isArray(r.categories));
    } catch (e) {
      if (String(e).includes("ECONNREFUSED")) return;
      throw e;
    }
  });
});
