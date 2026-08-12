import "server-only";
import type { AccountResponse } from "../../dto/account/account-dto";
import {
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
