import { z } from "zod";
import type { Account } from "../../domain/account/account";

/**
 * DTO定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
 *
 * DTOとドメインモデルは別物として扱う（CLAUDE.md「アーキテクチャ規約」）。
 * リクエスト/レスポンスの形とバリデーションルールはZodスキーマで定義する。
 */
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
