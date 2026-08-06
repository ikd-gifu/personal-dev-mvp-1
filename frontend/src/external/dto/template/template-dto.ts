import { z } from "zod";
import type { Template } from "../../domain/template/template";

/**
 * DTO定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 *
 * DTOとドメインモデルは別物として扱う（CLAUDE.md「アーキテクチャ規約」）。
 * リクエスト/レスポンスの形とバリデーションルールはZodスキーマで定義する。
 */

/**
 * ドメイン層（field.ts）はorderの正整数・重複禁止のみを検証し、「1から始まる連番」までは
 * 検証しない。API設計書（07_api_design.md「テンプレート作成」ビジネスルール）は
 * 「フィールドのorderは1から始まる連番」を要求しているため、CLAUDE.md
 * 「DTO側は同じかより厳密なルールにする」に従い、境界（DTO）でこの制約を追加する。
 */
function isSequentialFromOne(fields: { order: number }[]): boolean {
  const orders = fields.map((field) => field.order).sort((a, b) => a - b);
  return orders.every((order, index) => order === index + 1);
}

/**
 * 07_api_design.md「テンプレート詳細取得」は「単純、再利用しないので型定義しない」と
 * 記載されているが、これはAPI設計書上での型命名を省略してよいという意味であり、
 * 実装（境界）でのランタイム検証まで不要とするものではない。
 * idはDB（templates.id）がuuid型のため、不正な形式のままDrizzleへ渡すとPostgres側で
 * 例外になる（500相当）。境界（DTO）でuuid形式を検証し、早期に弾く。
 */
export const getTemplateByIdRequestSchema = z.object({
  id: z.uuid(),
});

export type GetTemplateByIdRequest = z.infer<
  typeof getTemplateByIdRequestSchema
>;

/**
 * 07_api_design.md「テンプレート一覧取得」も同様に型定義しない旨の記載があるが、
 * 上記と同じ理由でランタイム検証は行う。ownerIdはDB（templates.ownerId）がuuid型のため
 * uuid形式を要求する。qは自由なキーワード検索文字列のため形式は問わない。
 * pageやonlyMyTemplatesのようなパラメータは07_api_design.mdに定義がないため追加しない。
 */
export const listTemplatesRequestSchema = z.object({
  ownerId: z.uuid().optional(),
  q: z.string().optional(),
});

export type ListTemplatesRequest = z.infer<typeof listTemplatesRequestSchema>;

export const createTemplateRequestSchema = z.object({
  name: z.string(),
  fields: z
    .array(
      z.object({
        label: z.string(),
        order: z.number().int().positive(),
        isRequired: z.boolean(),
      }),
    )
    .refine(isSequentialFromOne, {
      message: "fields.order must be a sequential number starting from 1",
    }),
});

export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

export const editTemplateRequestSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  fields: z
    .array(
      z.object({
        id: z.uuid().optional(),
        label: z.string(),
        order: z.number().int().positive(),
        isRequired: z.boolean(),
      }),
    )
    .refine(isSequentialFromOne, {
      message: "fields.order must be a sequential number starting from 1",
    }),
});

export type EditTemplateRequest = z.infer<typeof editTemplateRequestSchema>;

export const deleteTemplateRequestSchema = z.object({
  id: z.uuid(),
});

export type DeleteTemplateRequest = z.infer<typeof deleteTemplateRequestSchema>;

export const templateResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  ownerId: z.uuid(),
  owner: z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    thumbnail: z.string().optional(),
  }),
  fields: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      order: z.number().int().positive(),
      isRequired: z.boolean(),
    }),
  ),
  updatedAt: z.iso.datetime(),
  isUsed: z.boolean(),
});

export type TemplateResponse = z.infer<typeof templateResponseSchema>;

export type CreateTemplateResponse = TemplateResponse;
export type EditTemplateResponse = TemplateResponse;
export type GetTemplateByIdResponse = TemplateResponse | null;
export type TemplateListResponse = TemplateResponse[];

export interface DeleteTemplateResponse {
  success: boolean;
}

/**
 * TemplateServiceのTemplateDetail（＋isUsed）から変換する。
 *
 * isUsedは今回常に false 固定で渡される（Note未実装のため）。
 * TODO: Note実装後、実際の使用有無（isUsed）を判定して渡すようService側を更新する。
 */
export function toTemplateResponse(
  template: Template,
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    thumbnail: string | null;
  },
  isUsed: boolean,
): TemplateResponse {
  return {
    id: template.id,
    name: template.name,
    ownerId: template.ownerId,
    owner: {
      id: owner.id,
      firstName: owner.firstName,
      lastName: owner.lastName,
      thumbnail: owner.thumbnail ?? undefined,
    },
    fields: template.fields.map((field) => ({
      id: field.id,
      label: field.label,
      order: field.order,
      isRequired: field.isRequired,
    })),
    updatedAt: template.updatedAt.toISOString(),
    isUsed,
  };
}
