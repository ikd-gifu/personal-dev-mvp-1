import "server-only";
import { getAuthenticatedSessionServer } from "./redirect.server";

/**
 * 認証済みでなければ処理を実行させないガード。
 * handlerには認証済みaccountのidのみを渡す。
 */
export async function withAuth<T>(
  handler: (ctx: { accountId: string }) => Promise<T>,
): Promise<T> {
  const session = await getAuthenticatedSessionServer();
  return handler({ accountId: session.account.id });
}
