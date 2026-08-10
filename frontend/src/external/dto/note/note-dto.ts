import { z } from "zod";
import type { NoteDetailResult } from "../../service/note/note-service";

/**
 * DTO定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 *
 * DTOとドメインモデルは別物として扱う（CLAUDE.md「アーキテクチャ規約」）。
 * リクエスト/レスポンスの形とバリデーションルールはZodスキーマで定義する。
 */

/**
 * idはDB（notes.id）がuuid型のため、不正な形式のままDrizzleへ渡すとPostgres側で
 * 例外になる（500相当）。境界（DTO）でuuid形式を検証する（Templateの実装方針を踏襲）。
 */
export const getNoteByIdRequestSchema = z.object({
  id: z.uuid(),
});

export type GetNoteByIdRequest = z.infer<typeof getNoteByIdRequestSchema>;

export const listNotesRequestSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["Draft", "Publish"]).optional(),
  templateId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
});

export type ListNotesRequest = z.infer<typeof listNotesRequestSchema>;

export const createNoteRequestSchema = z.object({
  title: z.string(),
  templateId: z.uuid(),
  sections: z
    .array(
      z.object({
        fieldId: z.uuid(),
        content: z.string(),
      }),
    )
    .optional(),
});

export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

/**
 * templateIdは受け取るが、Service層では無視する（3-4。将来のupsert対応のため
 * リクエスト型には残す。docs/plans/domain_implementation.md「設計書間の矛盾に対する
 * 合意済み解決方針」3-4参照）。
 */
export const editNoteRequestSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  templateId: z.uuid(),
  sections: z.array(
    z.object({
      id: z.uuid(),
      content: z.string(),
    }),
  ),
});

export type EditNoteRequest = z.infer<typeof editNoteRequestSchema>;

export const deleteNoteRequestSchema = z.object({
  id: z.uuid(),
});

export type DeleteNoteRequest = z.infer<typeof deleteNoteRequestSchema>;

export const publishNoteRequestSchema = z.object({
  noteId: z.uuid(),
});

export type PublishNoteRequest = z.infer<typeof publishNoteRequestSchema>;

export const unpublishNoteRequestSchema = z.object({
  noteId: z.uuid(),
});

export type UnpublishNoteRequest = z.infer<typeof unpublishNoteRequestSchema>;

export const noteResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  templateId: z.uuid(),
  ownerId: z.uuid(),
  owner: z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    thumbnail: z.string().optional(),
  }),
  status: z.enum(["Draft", "Publish"]),
  sections: z.array(
    z.object({
      id: z.uuid(),
      fieldId: z.uuid(),
      fieldLabel: z.string(),
      content: z.string(),
      isRequired: z.boolean(),
    }),
  ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type NoteResponse = z.infer<typeof noteResponseSchema>;

export type CreateNoteResponse = NoteResponse;
export type EditNoteResponse = NoteResponse;
export type GetNoteByIdResponse = NoteResponse | null;
export type ListNoteResponse = NoteResponse[];
export type PublishNoteResponse = NoteResponse;
export type UnpublishNoteResponse = NoteResponse;

export interface DeleteNoteResponse {
  success: boolean;
}

export function toNoteResponse(detail: NoteDetailResult): NoteResponse {
  return {
    id: detail.note.id,
    title: detail.note.title,
    templateId: detail.note.templateId,
    ownerId: detail.note.ownerId,
    owner: {
      id: detail.owner.id,
      firstName: detail.owner.firstName,
      lastName: detail.owner.lastName,
      thumbnail: detail.owner.thumbnail ?? undefined,
    },
    status: detail.note.status.value,
    sections: detail.sections.map((section) => ({
      id: section.id,
      fieldId: section.fieldId,
      fieldLabel: section.fieldLabel,
      content: section.content,
      isRequired: section.isRequired,
    })),
    createdAt: detail.note.createdAt.toISOString(),
    updatedAt: detail.note.updatedAt.toISOString(),
  };
}
