import { apiGet } from "../client.js";
import type { TagsData } from "../types.js";

export async function listTags(): Promise<TagsData> {
  const res = await apiGet<TagsData>("/v1/tags", {});
  return res.data ?? { categories: [], tags: [] };
}

export function formatTagsByCategory(data: TagsData) {
  return (data.categories ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    tagIds: c.tags,
    tags: (data.tags ?? [])
      .filter((t) => t.categoryId === c.id)
      .map((t) => ({ id: t.id, label: t.label })),
  }));
}
