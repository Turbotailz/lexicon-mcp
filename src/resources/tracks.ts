import { apiGet, apiPatch } from "../client.js";
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

export async function listTracks(opts: {
  limit?: number;
  offset?: number;
  fields?: string[];
} = {}): Promise<{ total: number; tracks: TrackSummary[] }> {
  const { limit = 50, offset = 0, fields } = opts;
  const res = await apiGet<TracksListData>("/v1/tracks", {
    limit,
    offset,
    source: "non-archived",
    fields: fields ?? [...DEFAULT_LIST_FIELDS],
    sort: [{ field: "dateAdded", dir: "desc" }],
  });
  return {
    total: res.data?.total ?? 0,
    tracks: res.data?.tracks ?? [],
  };
}

export async function searchTracks(opts: {
  filter: Record<string, unknown>;
  fields?: string[];
}): Promise<{ total: number; tracks: TrackSummary[] }> {
  const res = await apiGet<TracksListData>("/v1/search/tracks", {
    source: "non-archived",
    filter: opts.filter,
    fields: opts.fields ?? [...DEFAULT_SEARCH_FIELDS],
    sort: [{ field: "dateAdded", dir: "desc" }],
  });
  return {
    total: res.data?.total ?? 0,
    tracks: res.data?.tracks ?? [],
  };
}

export async function getTrack(id: number): Promise<TrackSummary | null> {
  const res = await apiGet<{ track: TrackSummary }>("/v1/track", { id });
  return res.data?.track ?? null;
}

export async function updateTrack(
  id: number,
  edits: TrackEdits,
): Promise<LexiconResponse<unknown>> {
  return apiPatch("/v1/track", { id, edits });
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
