import { apiGet } from "../client.js";

export async function getPlaying(): Promise<unknown> {
  const res = await apiGet("/v1/playing", {});
  return res.data ?? res;
}

export async function getQueue(): Promise<unknown> {
  const res = await apiGet("/v1/queue", {});
  return res.data ?? res;
}
