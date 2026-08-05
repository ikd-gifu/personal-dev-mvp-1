import "server-only";
import type { AccountResponse } from "../../dto/account/account-dto";
import { toAccountResponse } from "../../dto/account/account-dto";
import { accountService } from "../../service/account/account-service";

/**
 * URL定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
 * アカウント詳細取得（GET /api/accounts/:id）／現在のアカウント取得（GET /api/accounts/me）の
 * データアクセス層（DAL）。認証（誰が呼んでいるか）はこの関数の責務外で、
 * 呼び出し元（account.query.action.ts）がwithAuthで解決したidを渡す。
 *
 * ビジネスルール: 存在しない場合はnullをかえす
 */
export async function getAccountByIdQuery(
  id: string,
): Promise<AccountResponse | null> {
  const account = await accountService.getAccountById(id);
  return account ? toAccountResponse(account) : null;
}
