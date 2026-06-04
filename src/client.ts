/**
 * Lexicon Local API HTTP client.
 * @see https://www.lexicondj.com/docs/developers/api
 * @see https://www.lexicondj.com/developer/api-docs.yaml
 *
 * Lexicon accepts JSON bodies on GET — use node:http, not fetch.
 */

import http from "node:http";
import type { HttpMethod, LexiconResponse } from "./types.js";

function baseUrl(): URL {
  if (process.env.LEXICON_URL) return new URL(process.env.LEXICON_URL);
  const host = process.env.LEXICON_HOST ?? "localhost";
  const port = Number(process.env.LEXICON_PORT ?? "48624");
  return new URL(`http://${host}:${port}`);
}

export function normalizePath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!p.startsWith("/v1/")) {
    throw new Error(`path must start with /v1/ (got ${p})`);
  }
  return p;
}

export async function apiRequest<T = unknown>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
): Promise<LexiconResponse<T>> {
  const url = baseUrl();
  const fullPath = normalizePath(path);
  const payload =
    body === undefined || (method === "GET" && Object.keys(body).length === 0)
      ? method === "GET"
        ? JSON.stringify({})
        : undefined
      : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: fullPath,
        method,
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let json: LexiconResponse<T>;
          try {
            json = raw ? (JSON.parse(raw) as LexiconResponse<T>) : {};
          } catch {
            reject(
              new Error(
                `Invalid JSON from Lexicon (${res.statusCode}): ${raw.slice(0, 200)}`,
              ),
            );
            return;
          }
          if (json.errorCode != null) {
            reject(new Error(json.message ?? `Lexicon API error ${json.errorCode}`));
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(json.message ?? `HTTP ${res.statusCode}`));
            return;
          }
          resolve(json);
        });
      },
    );
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

export function apiGet<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<LexiconResponse<T>> {
  return apiRequest<T>("GET", path, body);
}

export function apiPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<LexiconResponse<T>> {
  return apiRequest<T>("PATCH", path, body);
}

export function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<LexiconResponse<T>> {
  return apiRequest<T>("POST", path, body);
}

export function apiDelete<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<LexiconResponse<T>> {
  return apiRequest<T>("DELETE", path, body);
}
