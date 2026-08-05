import "server-only";
import { redirect } from "next/navigation";
import type { AuthenticatedSession } from "./session.server";
import { getSessionServer } from "./session.server";

/**
 * 有効なセッション（account情報を含む）を取得する。
 * セッションが無効・未ログインの場合はログイン画面へリダイレクトする。
 */
export async function getAuthenticatedSessionServer(): Promise<AuthenticatedSession> {
  const session = await getSessionServer();

  if (!session?.account) {
    redirect("/login");
  }

  return session;
}
