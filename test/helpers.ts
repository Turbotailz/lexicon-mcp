import { mkdtempSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

const MANAGED_ENV = [
  "LEXICON_URL",
  "LEXICON_HOST",
  "LEXICON_PORT",
  "LEXICON_TOKEN",
  "LEXICON_APP_NAME",
  "LEXICON_CONFIG_DIR",
  "LEXICON_MCP_ALLOW_WRITES",
  "XDG_CONFIG_HOME",
] as const;

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface MockReply {
  status?: number;
  json?: unknown;
  raw?: string;
  headers?: Record<string, string>;
  hang?: boolean;
}

export interface MockServer {
  url: string;
  seen: RecordedRequest[];
  close: () => Promise<void>;
}

export function useEnv(values: Record<string, string | undefined> = {}): () => void {
  const prev = new Map(MANAGED_ENV.map((key) => [key, process.env[key]]));
  for (const key of MANAGED_ENV) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of prev) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

export async function startMock(
  handler: (req: RecordedRequest) => MockReply | Promise<MockReply>,
): Promise<MockServer> {
  const seen: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      const recorded: RecordedRequest = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      seen.push(recorded);
      void Promise.resolve()
        .then(() => handler(recorded))
        .then((reply) => {
          if (reply.hang) return;
          const body = reply.raw ?? JSON.stringify(reply.json ?? {});
          res.writeHead(reply.status ?? 200, {
            "content-type": "application/json",
            ...reply.headers,
          });
          res.end(body);
        })
        .catch((err: unknown) => {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: err instanceof Error ? err.message : String(err) }));
        });
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export async function withMock(
  handler: (req: RecordedRequest) => MockReply | Promise<MockReply>,
  fn: (mock: MockServer) => Promise<void>,
  env: Record<string, string | undefined> = {},
): Promise<void> {
  const mock = await startMock(handler);
  const configDir = mkdtempSync(join(tmpdir(), "lexicon-mcp-"));
  const restore = useEnv({
    LEXICON_URL: mock.url,
    LEXICON_CONFIG_DIR: configDir,
    ...env,
  });
  try {
    await fn(mock);
  } finally {
    restore();
    await mock.close();
  }
}

export function jsonBody(req: RecordedRequest): Record<string, unknown> {
  return req.body ? (JSON.parse(req.body) as Record<string, unknown>) : {};
}

export async function withMcp(fn: (client: Client) => Promise<void>): Promise<void> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "lexicon-mcp-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

export function resultText(result: unknown): string {
  const content =
    typeof result === "object" && result !== null && "content" in result
      ? (result as { content?: unknown }).content
      : undefined;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        (item as { type?: unknown }).type === "text" &&
        "text" in item &&
        typeof (item as { text?: unknown }).text === "string"
      ) {
        return (item as { text: string }).text;
      }
    }
  }
  throw new Error(`No text in tool result: ${JSON.stringify(result)}`);
}
