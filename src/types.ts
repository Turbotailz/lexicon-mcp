export type HttpMethod = "GET" | "PATCH" | "POST" | "DELETE";

export interface LexiconErrorBody {
  errorCode?: number;
  message?: string;
}

export interface LexiconResponse<T = unknown> extends LexiconErrorBody {
  data?: T;
}

export interface TagCategory {
  id: number;
  label: string;
  tags?: number[];
}

export interface Tag {
  id: number;
  label: string;
  categoryId: number;
}

export interface TagsData {
  categories: TagCategory[];
  tags: Tag[];
}

export interface TrackSummary {
  id: number;
  title?: string;
  artist?: string;
  albumTitle?: string;
  bpm?: number;
  key?: string;
  genre?: string;
  location?: string;
  incoming?: number | boolean;
  tags?: number[];
  dateAdded?: string;
  [key: string]: unknown;
}

export interface TracksListData {
  total: number;
  limit?: number;
  offset?: number;
  tracks: TrackSummary[];
}

export interface PlaylistNode {
  id: number;
  name: string;
  type: string | number;
  smartlist?: unknown;
  playlists?: PlaylistNode[];
}

export interface FlatPlaylist {
  id: number;
  name: string;
  type: string | number;
  depth: number;
  smartlist?: boolean;
}

export type TrackEdits = Record<string, unknown>;

export interface ControlPayload {
  action: string;
  parameters?: Record<string, unknown>;
}
