import { listTags } from "./tags.js";
import { listTracks } from "./tracks.js";

export async function libraryStats(opts: {
  incomingPathSubstring?: string;
  sampleLimit?: number;
} = {}): Promise<{
  totalTracks: number;
  scanned: number;
  incomingFlag: number;
  inIncomingFolder: number;
  withoutGenreTag: number;
  genreTagNames: string[];
}> {
  const incomingPathSubstring = opts.incomingPathSubstring ?? "DJ-incoming";
  const sampleLimit = opts.sampleLimit ?? 500;

  const tagData = await listTags();
  const genreTagIds = new Set<number>();
  for (const cat of tagData.categories ?? []) {
    if (cat.label === "Genre" && Array.isArray(cat.tags)) {
      for (const id of cat.tags) genreTagIds.add(id);
    }
  }
  const tagById = new Map((tagData.tags ?? []).map((t) => [t.id, t.label]));

  let offset = 0;
  let total = 0;
  let incoming = 0;
  let inIncomingFolder = 0;
  let withoutGenreTag = 0;
  const scanned: unknown[] = [];

  while (offset === 0 || scanned.length < total) {
    const page = await listTracks({
      limit: Math.min(sampleLimit, 1000),
      offset,
      fields: ["id", "title", "artist", "incoming", "location", "tags"],
    });
    total = page.total;
    for (const t of page.tracks) {
      scanned.push(t);
      if (t.incoming) incoming += 1;
      if (t.location?.includes(incomingPathSubstring)) inIncomingFolder += 1;
      const trackTags = t.tags ?? [];
      const hasGenre = trackTags.some((id) => genreTagIds.has(id));
      if (!hasGenre) withoutGenreTag += 1;
    }
    offset += page.tracks.length;
    if (page.tracks.length === 0) break;
    if (scanned.length >= total) break;
  }

  return {
    totalTracks: total,
    scanned: scanned.length,
    incomingFlag: incoming,
    inIncomingFolder,
    withoutGenreTag,
    genreTagNames: [...genreTagIds]
      .map((id) => tagById.get(id))
      .filter((l): l is string => Boolean(l)),
  };
}
