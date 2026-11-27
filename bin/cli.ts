#!/usr/bin/env node

import { pairAndDescribe } from "../src/client.js";
import { runStdioServer } from "../src/server.js";
import { packageVersion } from "../src/version.js";

const helpText = `lexicon-mcp — MCP server for Lexicon DJ Local API

This process speaks JSON-RPC over stdin/stdout. Started by an MCP host
(Cursor, Claude Desktop), not for interactive shell use.

Commands:
  lexicon-mcp            start the MCP server on stdio
  lexicon-mcp pair       approve this app in Lexicon v1.12+ and save the token
  lexicon-mcp --help
  lexicon-mcp --version

Cursor MCP config:
  { "mcpServers": { "lexicon": { "command": "lexicon-mcp" } } }

Requirements:
  - Lexicon running with Settings → Local API enabled
    (Settings → Integrations in v1.11 and older)
  - Default http://localhost:48624

Environment:
  LEXICON_URL, LEXICON_HOST, LEXICON_PORT
  LEXICON_APP_NAME            X-Lexicon-App header (default lexicon-mcp, max 64)
  LEXICON_TOKEN               Authorization: Bearer token (overrides the saved token)
  LEXICON_CONFIG_DIR          where \`pair\` writes token.json (default ~/.config/lexicon-mcp)
  LEXICON_MCP_ALLOW_WRITES=1  enable PATCH/POST/DELETE tools

Lexicon v1.12+ shows an approval popup once per app name. \`lexicon-mcp pair\`
waits up to 2 minutes and stores the token with mode 0600. The token is not
printed. If the app is already allowed, Lexicon returns HTTP 409 (error 11):
set LEXICON_TOKEN, or remove the app under Settings → Local API and pair again.

Lexicon v1.11 and older do not require a token. Leave LEXICON_TOKEN unset.

API reference: https://www.lexicondj.com/developer/api-docs.yaml
`;

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(helpText);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(packageVersion());
  process.exit(0);
}

if (args[0] === "pair") {
  try {
    console.log(await pairAndDescribe());
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (process.stdin.isTTY) {
  console.error(`lexicon-mcp: MCP server — not for interactive terminals.

Run: lexicon-mcp --help
Pair Lexicon v1.12+: lexicon-mcp pair
Configure "command": "lexicon-mcp" in your MCP client settings.
`);
  process.exit(0);
}

await runStdioServer();
