import "server-only";
import type { AccountResponse } from "../../dto/account/account-dto";
import {
  accountEmailSchema,
  accountIdSchema,
  toAccountResponse,
} from "../../dto/account/account-dto";
import { accountService } from "../../service/account/account-service";

/**
 * URL定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
 * アカウント詳細取得（GET /api/accounts/:id）／現在のアカウント取得（GET /api/accounts/me）の
 * データアクセス層（DAL）。認証（誰が呼んでいるか）はこの関数の責務外で、
 * 呼び出し元（account.query.action.ts）がwithAuthで解決したidを渡す。
 *
 * idはDB（accounts.id）がuuid型のため、境界（DTO）でuuid形式を検証する
 * （template.query.server.tsと同様。既知の不整合の解消。docs/plans/external_implementation.md参照）。
 *
 * ビジネスルール: 存在しない場合はnullをかえす
 */
export async function getAccountByIdQuery(
  id: string,
): Promise<AccountResponse | null> {
  const validId = accountIdSchema.parse(id);
  const account = await accountService.getAccountById(validId);
  return account ? toAccountResponse(account) : null;
}

/**
 * URL定義: なし(内部処理)。frontend/docs/08_authentication.md「customSession プラグイン」の
 * アカウントキャッシュ(unstable_cache)から呼ばれる、features/auth/lib/better-auth.ts専用のクエリ。
 *
 * ビジネスルール: 存在しない場合はnullをかえす(getAccountByIdQueryと同様)
 */
export async function getAccountByEmailQuery(
  email: string,
): Promise<AccountResponse | null> {
  const validEmail = accountEmailSchema.parse(email);
  const account = await accountService.getAccountByEmail(validEmail);
  return account ? toAccountResponse(account) : null;
}
