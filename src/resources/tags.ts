import { apiDelete, apiGet, apiPatch, apiPost } from "../client.js";
import type { LexiconResponse, TagsData } from "../types.js";

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

export async function createTag(input: {
  categoryId: number;
  label: string;
}): Promise<LexiconResponse<unknown>> {
  return apiPost("/v1/tag", { categoryId: input.categoryId, label: input.label });
}

export async function updateTag(input: {
  id: number;
  categoryId?: number;
  label?: string;
  position?: number;
}): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = { id: input.id };
  if (input.categoryId !== undefined) body.categoryId = input.categoryId;
  if (input.label !== undefined) body.label = input.label;
  if (input.position !== undefined) body.position = input.position;
  return apiPatch("/v1/tag", body);
}

export async function deleteTag(id: number): Promise<LexiconResponse<unknown>> {
  return apiDelete("/v1/tag", { id });
}

export async function createTagCategory(input: {
  label: string;
  color?: string;
}): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = { label: input.label };
  if (input.color !== undefined) body.color = input.color;
  return apiPost("/v1/tag-category", body);
}

export async function updateTagCategory(input: {
  id: number;
  label?: string;
  color?: string;
  tags?: number[];
  position?: number;
}): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = { id: input.id };
  if (input.label !== undefined) body.label = input.label;
  if (input.color !== undefined) body.color = input.color;
  if (input.tags !== undefined) body.tags = input.tags;
  if (input.position !== undefined) body.position = input.position;
  return apiPatch("/v1/tag-category", body);
}

export async function deleteTagCategory(id: number): Promise<LexiconResponse<unknown>> {
  return apiDelete("/v1/tag-category", { id });
}
