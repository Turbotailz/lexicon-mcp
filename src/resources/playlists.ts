import { apiDelete, apiGet, apiPatch, apiPost } from "../client.js";
import type { FlatPlaylist, LexiconResponse, PlaylistNode } from "../types.js";

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

export async function getSelectedPlaylistIds(): Promise<number[]> {
  const res = await apiGet<{ ids?: number[] }>("/v1/playlists/selected", {});
  return res.data?.ids ?? [];
}

export async function createPlaylist(input: {
  name: string;
  type: string | number;
  parentId?: number;
  smartlist?: Record<string, unknown>;
}): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = {
    name: input.name,
    type: input.type,
  };
  if (input.parentId !== undefined) body.parentId = input.parentId;
  if (input.smartlist !== undefined) body.smartlist = input.smartlist;
  return apiPost("/v1/playlist", body);
}

export async function updatePlaylist(input: {
  id: number;
  name?: string;
  parentId?: number;
  position?: number;
  smartlist?: Record<string, unknown>;
}): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = { id: input.id };
  if (input.name !== undefined) body.name = input.name;
  if (input.parentId !== undefined) body.parentId = input.parentId;
  if (input.position !== undefined) body.position = input.position;
  if (input.smartlist !== undefined) body.smartlist = input.smartlist;
  return apiPatch("/v1/playlist", body);
}

export async function deletePlaylists(ids: number[]): Promise<LexiconResponse<unknown>> {
  return apiDelete("/v1/playlists", { ids });
}

export async function addPlaylistTracks(input: {
  id: number;
  trackIds: number[];
  index?: number;
}): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = {
    id: input.id,
    trackIds: input.trackIds,
  };
  if (input.index !== undefined) body.index = input.index;
  return apiPatch("/v1/playlist-tracks", body);
}

export async function removePlaylistTracks(input: {
  id: number;
  trackIds: number[];
}): Promise<LexiconResponse<unknown>> {
  return apiDelete("/v1/playlist-tracks", { id: input.id, trackIds: input.trackIds });
}
