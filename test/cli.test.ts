import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { startMock } from "./helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "bin", "cli.js");
const SECRET = "super-secret-token-value";

function runCli(args: string[], env: Record<string, string | undefined> = {}): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "LEXICON_URL",
    "LEXICON_HOST",
    "LEXICON_PORT",
    "LEXICON_TOKEN",
    "LEXICON_APP_NAME",
    "LEXICON_CONFIG_DIR",
    "LEXICON_MCP_ALLOW_WRITES",
  ]) {
    delete childEnv[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env: childEnv });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("cli", { concurrency: false }, () => {
  it("prints v1.12 auth help", async () => {
    const result = await runCli(["--help"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Settings → Local API/);
    assert.match(result.stdout, /LEXICON_TOKEN/);
    assert.match(result.stdout, /LEXICON_APP_NAME/);
    assert.match(result.stdout, /lexicon-mcp pair/);
    assert.equal(result.stdout.includes("Settings → Integrations → Local API"), false);
    assert.equal(result.stdout.includes(SECRET), false);
  });

  it("prints the package version", async () => {
    const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as {
      version: string;
    };
    const result = await runCli(["--version"]);
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), pkg.version);
  });

  it("pairs from the CLI without printing the token", async () => {
    const token = "paired-token-value-001";
    const configDir = mkdtempSync(join(tmpdir(), "lexicon-mcp-cli-"));
    const mock = await startMock(() => ({
      status: 200,
      json: { data: { token } },
      headers: { "X-Lexicon-Token": token },
    }));
    try {
      const result = await runCli(["pair"], {
        LEXICON_URL: mock.url,
        LEXICON_CONFIG_DIR: configDir,
      });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Paired "lexicon-mcp"/);
      assert.equal(result.stdout.includes(token), false);
      assert.equal(result.stderr.includes(token), false);
      const stored = JSON.parse(readFileSync(join(configDir, "token.json"), "utf8")) as {
        token: string;
      };
      assert.equal(stored.token, token);
      assert.equal(mock.seen[0]?.headers.authorization, undefined);
      assert.equal(mock.seen[0]?.headers["x-lexicon-app"], "lexicon-mcp");
    } finally {
      await mock.close();
    }
  });

  it("explains error 11 without leaking a token", async () => {
    const mock = await startMock(() => ({
      status: 409,
      json: { errorCode: 11, message: `already allowed ${SECRET}` },
    }));
    try {
      const result = await runCli(["pair"], { LEXICON_URL: mock.url, LEXICON_TOKEN: SECRET });
      assert.equal(result.code, 1);
      assert.match(result.stderr, /already allowed/);
      assert.match(result.stderr, /error 11/);
      assert.match(result.stderr, /Settings → Local API/);
      assert.equal(result.stderr.includes(SECRET), false);
      assert.equal(result.stdout.includes(SECRET), false);
    } finally {
      await mock.close();
    }
  });
});
