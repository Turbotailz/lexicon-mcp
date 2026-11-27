import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_APP_NAME = "lexicon-mcp";
export const MAX_APP_NAME_LENGTH = 64;

/** Pairing waits up to two minutes for the user to approve the app. */
export const PAIR_TIMEOUT_MS = 150_000;

const SETTINGS =
  "Settings → Local API (Settings → Integrations in v1.11 and older)";

export interface PairResult {
  appName: string;
  configPath: string;
  envOverrides: boolean;
}

export class LexiconApiError extends Error {
  readonly errorCode?: number;
  readonly statusCode?: number;

  constructor(
    message: string,
    details?: { errorCode?: number; statusCode?: number },
  ) {
    super(message);
    this.name = "LexiconApiError";
    this.errorCode = details?.errorCode;
    this.statusCode = details?.statusCode;
  }
}

export function appName(): string {
  const raw = process.env.LEXICON_APP_NAME;
  const name = raw === undefined || raw.trim() === "" ? DEFAULT_APP_NAME : raw.trim();
  if (name.length > MAX_APP_NAME_LENGTH) {
    throw new Error(
      `LEXICON_APP_NAME must be at most ${MAX_APP_NAME_LENGTH} characters (Lexicon's app name limit).`,
    );
  }
  if (/[\r\n]/.test(name)) {
    throw new Error("LEXICON_APP_NAME cannot contain a newline.");
  }
  return name;
}

/** LEXICON_TOKEN wins over the paired token file. Empty is treated as unset. */
export function tokenFromEnv(): string | undefined {
  const raw = process.env.LEXICON_TOKEN;
  if (raw === undefined) return undefined;
  const token = raw.trim();
  if (!token) return undefined;
  if (/[\r\n]/.test(token)) {
    throw new Error(
      "LEXICON_TOKEN contains a newline. Set it to the single-line token from Settings → Local API (Settings → Integrations in v1.11 and older).",
    );
  }
  return token;
}

export function configDir(): string {
  const override = process.env.LEXICON_CONFIG_DIR?.trim();
  if (override) return override;
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  const base = xdg ? xdg : join(homedir(), ".config");
  return join(base, "lexicon-mcp");
}

export function tokenFilePath(): string {
  return join(configDir(), "token.json");
}

export function readStoredToken(name: string): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(tokenFilePath(), "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as { appName?: unknown; token?: unknown };
    if (parsed.appName !== name) return undefined;
    if (typeof parsed.token !== "string") return undefined;
    const token = parsed.token.trim();
    if (!token || /[\r\n]/.test(token)) return undefined;
    return token;
  } catch {
    return undefined;
  }
}

/**
 * Token sent on API requests. The environment variable always wins.
 * The file is only a fallback for a paired app of the same name.
 */
export function resolveRequestToken(name = appName()): string | undefined {
  return tokenFromEnv() ?? readStoredToken(name);
}

/** Persist a paired token. Mode 0600 file, 0700 directory. Does not log the token. */
export function saveToken(token: string, name: string): string {
  const trimmed = token.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) {
    throw new Error("Refusing to store an empty Lexicon token or one that contains a newline.");
  }
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = tokenFilePath();
  if (readStoredToken(name) !== trimmed) {
    writeFileSync(path, `${JSON.stringify({ appName: name, token: trimmed })}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
  chmodSync(path, 0o600);
  return path;
}

export function redactSecrets(text: string, secrets: string[] = []): string {
  // Do not treat "Bearer (LEXICON_TOKEN)" in our own guidance as a credential.
  let out = text.replace(/Bearer\s+(?!\()(\S+)/gi, "Bearer [redacted]");
  out = out.replace(/("token"\s*:\s*")[^"]*(")/gi, "$1[redacted]$2");
  const unique = [...new Set(secrets.filter((secret) => secret.length >= 8))];
  for (const secret of unique) {
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

/** Tokens we already hold. Used to scrub error text even when a request omits Authorization. */
export function knownSecrets(name = appName()): string[] {
  return [tokenFromEnv(), readStoredToken(name)].filter((value): value is string => Boolean(value));
}

export function formatApiError(input: {
  errorCode?: number;
  statusCode?: number;
  message?: string;
  appName?: string;
  secrets?: string[];
}): string {
  const app = input.appName ?? DEFAULT_APP_NAME;
  const secrets = input.secrets ?? [];
  const apiMessage = input.message ? redactSecrets(input.message, secrets) : undefined;
  const hint = authErrorHint(input.errorCode, app) ?? selectedTrackHint(input.errorCode);
  let composed: string;
  if (hint) {
    composed =
      apiMessage && apiMessage !== hint && !hint.includes(apiMessage)
        ? `${hint} Lexicon said: ${apiMessage}`
        : hint;
  } else if (apiMessage) {
    composed = apiMessage;
  } else if (input.errorCode != null) {
    composed = `Lexicon API error ${input.errorCode}`;
  } else if (input.statusCode) {
    composed = `HTTP ${input.statusCode}`;
  } else {
    composed = "Lexicon API error";
  }
  return redactSecrets(composed, secrets);
}

function selectedTrackHint(code: number | undefined): string | undefined {
  if (code !== 113) return undefined;
  return 'No track is selected in Lexicon (error 113). Select a track in the track browser, or pass a numeric id. lexicon_get_selected_tracks lists the current selection.';
}

function authErrorHint(code: number | undefined, app: string): string | undefined {
  switch (code) {
    case 6:
      return `Lexicon blocked "${app}" (error 6, HTTP 403). In Lexicon v1.11 and older this code means the app is not allowed to use the API (HTTP 401). Open ${SETTINGS}, allow "${app}", then pair again with \`lexicon-mcp pair\` or the lexicon_pair tool.`;
    case 9:
      return `Lexicon rejected the token or app name (error 9, HTTP 401). Lexicon v1.12+ needs the X-Lexicon-App header (LEXICON_APP_NAME, default "${DEFAULT_APP_NAME}") and Authorization: Bearer (LEXICON_TOKEN). Copy the API token from ${SETTINGS}, or pair with \`lexicon-mcp pair\` / the lexicon_pair tool. A web page cannot pair.`;
    case 10:
      return `Lexicon is waiting for approval of "${app}", or the popup was closed (error 10, HTTP 401). Approve the popup, or run \`lexicon-mcp pair\` / the lexicon_pair tool and approve within 2 minutes. After a dismissal Lexicon will not ask again for about a minute. If the app is already allowed, set LEXICON_TOKEN from ${SETTINGS}.`;
    case 11:
      return `"${app}" is already allowed, but this request did not include its token (error 11, HTTP 409). Lexicon only asks once per app name. Set LEXICON_TOKEN, or remove "${app}" under ${SETTINGS} and pair again. Pairing is the only time Lexicon can show the token; it stores a hash afterwards.`;
    case 12:
      return "The request body is too large (error 12, HTTP 413). Lexicon allows 64 KB from another device before the app is let in, and 100 MB otherwise. Send a smaller payload.";
    default:
      return undefined;
  }
}

export function pairSuccessMessage(result: PairResult): string {
  const override = result.envOverrides
    ? `LEXICON_TOKEN is set, so it still overrides the file at ${result.configPath}. Unset LEXICON_TOKEN to use the token just saved.`
    : `Requests use this file when LEXICON_TOKEN is not set.`;
  return [
    `Paired "${result.appName}" with Lexicon.`,
    `Token saved to ${result.configPath} with mode 0600.`,
    override,
    "LEXICON_TOKEN always takes precedence over the saved token.",
    `The token is not printed. You can also copy the API token from ${SETTINGS}.`,
  ].join(" ");
}

export function pairTimeoutMessage(timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  return `Timed out after ${seconds}s waiting for Lexicon to approve this app. Pairing waits up to 2 minutes. Approve the popup in Lexicon (${SETTINGS}), then run pairing again.`;
}
