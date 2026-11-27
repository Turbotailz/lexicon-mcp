import { apiDelete, apiGet, apiPatch, apiPost } from "../client.js";
import type { LexiconResponse, TrackEdits, TrackSummary, TracksListData } from "../types.js";

const DEFAULT_LIST_FIELDS = [
  "id",
  "title",
  "artist",
  "albumTitle",
  "bpm",
  "key",
  "genre",
  "location",
  "incoming",
  "tags",
  "dateAdded",
] as const;

const DEFAULT_SEARCH_FIELDS = [
  "id",
  "title",
  "artist",
  "bpm",
  "key",
  "genre",
  "location",
  "tags",
  "incoming",
] as const;

export async function ping(): Promise<{
  ok: boolean;
  trackCount: number | null;
  tagCategories: number;
}> {
  const tags = await apiGet<{ categories?: unknown[] }>("/v1/tags", {});
  const list = await apiGet<TracksListData>("/v1/tracks", {
    limit: 1,
    offset: 0,
    source: "non-archived",
    fields: ["id"],
  });
  return {
    ok: true,
    trackCount: list.data?.total ?? null,
    tagCategories: tags.data?.categories?.length ?? 0,
  };
}

export type TrackSource = "non-archived" | "all" | "archived" | "incoming";

export interface TrackSort {
  field: string;
  dir?: "asc" | "desc";
}

const DEFAULT_SORT: TrackSort[] = [{ field: "dateAdded", dir: "desc" }];

export async function listTracks(opts: {
  limit?: number;
  offset?: number;
  source?: TrackSource;
  fields?: string[];
  sort?: TrackSort[];
} = {}): Promise<{ total: number; tracks: TrackSummary[] }> {
  const { limit = 50, offset = 0, source = "non-archived", fields, sort } = opts;
  const res = await apiGet<TracksListData>("/v1/tracks", {
    limit,
    offset,
    source,
    fields: fields ?? [...DEFAULT_LIST_FIELDS],
    sort: sort ?? DEFAULT_SORT,
  });
  return {
    total: res.data?.total ?? 0,
    tracks: res.data?.tracks ?? [],
  };
}

export async function searchTracks(opts: {
  filter: Record<string, unknown>;
  limit?: number;
  offset?: number;
  source?: TrackSource;
  fields?: string[];
  sort?: TrackSort[];
}): Promise<{ total: number; tracks: TrackSummary[] }> {
  const res = await apiGet<TracksListData>("/v1/search/tracks", {
    source: opts.source ?? "non-archived",
    filter: opts.filter,
    fields: opts.fields ?? [...DEFAULT_SEARCH_FIELDS],
    sort: opts.sort ?? DEFAULT_SORT,
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });
  return {
    total: res.data?.total ?? 0,
    tracks: res.data?.tracks ?? [],
  };
}

/** `selected` is the topmost track selected in Lexicon. Error 113 when nothing is selected. */
export async function getTrack(id: number | "selected"): Promise<TrackSummary | null> {
  const res = await apiGet<{ track: TrackSummary }>("/v1/track", { id });
  return res.data?.track ?? null;
}

export async function getSelectedTrackIds(): Promise<number[]> {
  const res = await apiGet<{ ids?: number[] }>("/v1/tracks/selected", {});
  return res.data?.ids ?? [];
}

/**
 * `id: "selected"` applies edits to every track selected in Lexicon.
 * A relative numeric string (`+1`, `-2`) counts from each track's own value.
 */
export async function updateTrack(
  id: number | "selected",
  edits: TrackEdits,
): Promise<LexiconResponse<unknown>> {
  return apiPatch("/v1/track", { id, edits });
}

export async function addTracks(locations: string[]): Promise<LexiconResponse<unknown>> {
  return apiPost("/v1/tracks", { locations });
}

export async function deleteTracks(ids: number[]): Promise<LexiconResponse<unknown>> {
  return apiDelete("/v1/tracks", { ids });
}

export async function updateTrackLocation(input: {
  id: number;
  location: string;
  checkFileExists?: boolean;
}): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = {
    id: input.id,
    location: input.location,
  };
  if (input.checkFileExists !== undefined) body.checkFileExists = input.checkFileExists;
  return apiPatch("/v1/track/location", body);
}

export async function listIncoming(opts: { limit?: number } = {}): Promise<{
  totalInLibrary: number;
  matching: number;
  tracks: TrackSummary[];
}> {
  const max = opts.limit ?? 50;
  const { tracks, total } = await listTracks({ limit: 1000, offset: 0 });
  const incoming = tracks.filter(
    (t) =>
      Boolean(t.incoming) ||
      (t.location && String(t.location).includes("DJ-incoming")),
  );
  return {
    totalInLibrary: total,
    matching: incoming.length,
    tracks: incoming.slice(0, max),
  };
}
