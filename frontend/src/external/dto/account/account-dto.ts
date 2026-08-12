import { z } from "zod";
import type { Account } from "../../domain/account/account";

/**
 * DTO定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
 *
 * DTOとドメインモデルは別物として扱う（CLAUDE.md「アーキテクチャ規約」）。
 * リクエスト/レスポンスの形とバリデーションルールはZodスキーマで定義する。
 */
/**
 * アカウント詳細取得（GET /api/accounts/:id）／現在のアカウント取得（GET /api/accounts/me）の
 * idはDB（accounts.id）がuuid型のため、不正な形式のままDrizzleへ渡すとPostgres側で
 * 例外になる（500相当）。境界（DTO）でuuid形式を検証し、早期に弾く
 * （template-dto.tsのgetTemplateByIdRequestSchemaと同じ理由）。
 *
 * Accountの各関数はidをオブジェクトではなく素の文字列引数として受け取る形状のため
 * （Templateとはリクエスト形状が異なる）、z.object({ id: z.uuid() })ではなく
 * z.uuid()単体のスキーマとする。
 */
export const accountIdSchema = z.uuid();

export const createOrGetAccountRequestSchema = z.object({
  email: z.email(),
  name: z.string(),
  provider: z.string(),
  providerAccountId: z.string(),
  thumbnail: z.string().optional(),
});

export type CreateOrGetAccountRequest = z.infer<
  typeof createOrGetAccountRequestSchema
>;

export const accountResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  thumbnail: z.string().optional(),
  lastLoginAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type AccountResponse = z.infer<typeof accountResponseSchema>;

export type CreateOrGetAccountResponse = AccountResponse;
export type GetCurrentAccountResponse = AccountResponse;
export type GetAccountByIdResponse = AccountResponse | null;

export function toAccountResponse(account: Account): AccountResponse {
  return {
    id: account.id,
    email: account.email.value,
    firstName: account.firstName,
    lastName: account.lastName,
    fullName: account.fullName,
    thumbnail: account.thumbnail ?? undefined,
    lastLoginAt: (account.lastLoginAt ?? account.updatedAt).toISOString(),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}
