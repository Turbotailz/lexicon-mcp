/**
 * Lexicon Local API HTTP client.
 * @see https://www.lexicondj.com/docs/developers/api
 * @see https://www.lexicondj.com/developer/api-docs.yaml
 *
 * Lexicon accepts JSON bodies on GET — use node:http, not fetch.
 *
 * Lexicon v1.12+ identifies the app with X-Lexicon-App and a bearer token.
 * v1.11 and older ignore those headers and do not require a token.
 */

import http from "node:http";
import {
  PAIR_TIMEOUT_MS,
  appName,
  formatApiError,
  LexiconApiError,
  knownSecrets,
  pairSuccessMessage,
  pairTimeoutMessage,
  readStoredToken,
  redactSecrets,
  resolveRequestToken,
  saveToken,
  tokenFromEnv,
  tokenFilePath,
  type PairResult,
} from "./auth.js";
import type { HttpMethod, LexiconResponse } from "./types.js";

export { PAIR_TIMEOUT_MS, LexiconApiError };

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

export interface ApiRequestOptions {
  timeoutMs?: number;
  /**
   * Send Authorization when a token is configured.
   * Pairing omits it so a stale token cannot block the approval popup (error 9).
   * Default true.
   */
  authorize?: boolean;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const token = raw?.trim();
  return token ? token : undefined;
}

function tokenFromBody(json: LexiconResponse<unknown>): string | undefined {
  const data = json.data as { token?: unknown } | undefined;
  if (!data || typeof data.token !== "string") return undefined;
  const token = data.token.trim();
  return token.length > 0 ? token : undefined;
}

export async function apiRequest<T = unknown>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
  options?: ApiRequestOptions,
): Promise<LexiconResponse<T>> {
  const url = baseUrl();
  const fullPath = normalizePath(path);
  const name = appName();
  const authorize = options?.authorize !== false;
  const token = authorize ? resolveRequestToken(name) : undefined;
  const timeoutMs = options?.timeoutMs;
  const secrets = knownSecrets(name);
  if (token) secrets.push(token);

  const payload =
    body === undefined || (method === "GET" && Object.keys(body).length === 0)
      ? method === "GET"
        ? JSON.stringify({})
        : undefined
      : JSON.stringify(body);

  const headers: Record<string, string> = {
    "X-Lexicon-App": name,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(Buffer.byteLength(payload));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const succeed = (value: LexiconResponse<T>) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: fullPath,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const headerToken = headerValue(res.headers["x-lexicon-token"]);
          if (headerToken) secrets.push(headerToken);

          let json: LexiconResponse<T>;
          try {
            json = raw ? (JSON.parse(raw) as LexiconResponse<T>) : {};
          } catch {
            fail(
              new LexiconApiError(
                `Invalid JSON from Lexicon (${res.statusCode}): ${redactSecrets(raw.slice(0, 200), secrets)}`,
                { statusCode: res.statusCode },
              ),
            );
            return;
          }

          const bodyToken = tokenFromBody(json);
          if (bodyToken) secrets.push(bodyToken);

          const status = res.statusCode ?? 0;
          const failed = json.errorCode != null || status >= 400;
          // Lexicon returns the paired token in X-Lexicon-Token when the user approves the app.
          if (!failed && headerToken) {
            try {
              saveToken(headerToken, name);
            } catch {
              // A later pair() save reports the failure. Never log the token.
            }
          }

          if (failed) {
            fail(
              new LexiconApiError(
                formatApiError({
                  errorCode: json.errorCode,
                  statusCode: status,
                  message: json.message,
                  appName: name,
                  secrets,
                }),
                { errorCode: json.errorCode, statusCode: status },
              ),
            );
            return;
          }
          succeed(json);
        });
      },
    );

    let timedOut = false;
    let timeoutErr: Error | undefined;
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (timedOut && timeoutErr) {
        fail(timeoutErr);
        return;
      }
      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH") {
        fail(
          new Error(
            `Cannot reach Lexicon at ${url.origin} (${err.code}). Start Lexicon and enable the Local API under Settings → Local API (Settings → Integrations in v1.11 and older).`,
          ),
        );
        return;
      }
      fail(err);
    });

    if (timeoutMs != null) {
      req.setTimeout(timeoutMs, () => {
        timedOut = true;
        timeoutErr = new Error(
          fullPath === "/v1/auth/pair"
            ? pairTimeoutMessage(timeoutMs)
            : `Lexicon request timed out after ${timeoutMs}ms (${fullPath}).`,
        );
        req.destroy(timeoutErr);
      });
    }

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

/**
 * POST /v1/auth/pair. Waits for the user to approve the app (up to 2 minutes).
 * Stores the token in the config file. Does not return or log the token.
 * Authorization is omitted so an old token cannot turn the popup into error 9.
 */
export async function pairApp(options?: { timeoutMs?: number }): Promise<PairResult> {
  const name = appName();
  const timeoutMs = options?.timeoutMs ?? PAIR_TIMEOUT_MS;
  const res = await apiRequest<{ token?: string }>("POST", "/v1/auth/pair", { name }, {
    timeoutMs,
    authorize: false,
  });
  const token = typeof res.data?.token === "string" ? res.data.token.trim() : "";
  if (!token) {
    const stored = readStoredToken(name);
    if (!stored) {
      throw new Error(
        `Lexicon approved "${name}" but did not return a token. Copy the API token from Settings → Local API (Settings → Integrations in v1.11 and older) and set LEXICON_TOKEN.`,
      );
    }
    return {
      appName: name,
      configPath: tokenFilePath(),
      envOverrides: tokenFromEnv() !== undefined,
    };
  }
  try {
    const configPath = saveToken(token, name);
    return {
      appName: name,
      configPath,
      envOverrides: tokenFromEnv() !== undefined,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    throw new Error(
      `Lexicon approved "${name}", but the token could not be saved (${redactSecrets(reason, [token])}). Set LEXICON_TOKEN from Settings → Local API (Settings → Integrations in v1.11 and older). The token was not printed.`,
    );
  }
}

export async function pairAndDescribe(options?: { timeoutMs?: number }): Promise<string> {
  return pairSuccessMessage(await pairApp(options));
}
