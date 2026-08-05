import "server-only";
import type { AccountResponse } from "../../dto/account/account-dto";
import {
  createOrGetAccountRequestSchema,
  toAccountResponse,
} from "../../dto/account/account-dto";
import { accountService } from "../../service/account/account-service";

/**
 * URL定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
 * ユーザー新規登録（内部処理）: POST /api/accounts/auth
 *
 * Server Action（.action）としては公開しない。OAuthの認証ハンドシェイクを
 * 経ずに任意のクライアントがアカウントを作成・書き換えできてしまうため、
 * 将来の認証基盤（better-auth等）のサーバー側コールバックから直接呼び出す。
 */
export async function createOrGetAccountCommand(
  input: unknown,
): Promise<AccountResponse> {
  const parsed = createOrGetAccountRequestSchema.parse(input);
  const account = await accountService.createOrGetAccount(parsed);
  return toAccountResponse(account);
}
