"use server";

import { withAuth } from "../../../features/auth/servers/auth.guard";
import type { AccountResponse } from "../../dto/account/account-dto";
import { accountIdSchema } from "../../dto/account/account-dto";
import { getAccountByIdQuery } from "./account.query.server";

/**
 * URL定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
 * アカウント詳細取得（GET /api/accounts/:id）
 *
 * `.query.action.ts`はクライアントから直接呼び出せるServer Actionの入口のため、
 * ここでもaccountIdSchemaでuuid形式を検証してからquery.server.tsへ渡す
 * （query.server.ts側の検証と合わせて境界の多重防御。template.query.action.tsと同じ方針）。
 *
 * ビジネスルール: 認証必須（Owner判定は不要。誰のアカウントでも取得できる）
 */
export async function getAccountByIdAction(
  id: string,
): Promise<AccountResponse | null> {
  const validId = accountIdSchema.parse(id);
  return withAuth(() => getAccountByIdQuery(validId));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
 * 現在のアカウント取得（GET /api/accounts/me）
 *
 * ビジネスルール: 認証必須
 */
export async function getCurrentAccountAction(): Promise<AccountResponse | null> {
  return withAuth(({ accountId }) => getAccountByIdQuery(accountId));
}
