import { apiGet } from "../client.js";
import type { FlatPlaylist, PlaylistNode } from "../types.js";

export async function listPlaylists(): Promise<PlaylistNode[]> {
  const res = await apiGet<{ playlists: PlaylistNode[] }>("/v1/playlists", {});
  return res.data?.playlists ?? [];
}

export function flattenPlaylists(
  nodes: PlaylistNode[] | undefined,
  depth = 0,
): FlatPlaylist[] {
  const out: FlatPlaylist[] = [];
  for (const node of nodes ?? []) {
    out.push({
      id: node.id,
      name: node.name,
      type: node.type,
      depth,
      smartlist: node.smartlist ? true : undefined,
    });
    if (node.playlists?.length) {
      out.push(...flattenPlaylists(node.playlists, depth + 1));
    }
  }
  return out;
}

export async function getPlaylistById(id: number): Promise<unknown> {
  const res = await apiGet("/v1/playlist", { id });
  return res.data ?? res;
}

export async function getPlaylistByPath(
  path: string[],
  type?: string | number,
): Promise<unknown> {
  const body: Record<string, unknown> = { path };
  if (type !== undefined) body.type = type;
  const res = await apiGet("/v1/playlist-by-path", body);
  return res.data ?? res;
}
