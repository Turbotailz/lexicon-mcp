import { apiPost } from "../client.js";
import type { LexiconResponse } from "../types.js";

export async function runControl(
  action: string,
  parameters?: Record<string, unknown>,
): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = { action };
  if (parameters !== undefined) body.parameters = parameters;
  return apiPost("/v1/control", body);
}
