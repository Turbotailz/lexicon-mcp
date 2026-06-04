#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runStdioServer } from "../src/server.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`lexicon-mcp — MCP server for Lexicon DJ Local API

This process speaks JSON-RPC over stdin/stdout. Started by an MCP host
(Cursor, Claude Desktop), not for interactive shell use.

Cursor MCP config:
  { "mcpServers": { "lexicon": { "command": "lexicon-mcp" } } }

Requirements:
  - Lexicon running with Settings → Integrations → Local API enabled
  - Default http://localhost:48624

Environment:
  LEXICON_URL, LEXICON_HOST, LEXICON_PORT
  LEXICON_MCP_ALLOW_WRITES=1  — enable PATCH/POST/DELETE tools

API reference: https://www.lexicondj.com/developer/api-docs.yaml
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  const dir = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(dir, "..", "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

if (process.stdin.isTTY) {
  console.error(`lexicon-mcp: MCP server — not for interactive terminals.

Run: lexicon-mcp --help
Configure "command": "lexicon-mcp" in Cursor MCP settings.
`);
  process.exit(0);
}

await runStdioServer();
