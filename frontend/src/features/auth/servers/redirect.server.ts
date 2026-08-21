import "server-only";
import { redirect } from "next/navigation";
import type { AuthenticatedSession } from "./session.server";
import { getSessionServer } from "./session.server";

/**
 * account情報が保証されたセッション。
 * AuthenticatedSession（`Session`。accountはoptional）から、
 * このファイルのガード通過後のみ成立する不変条件として型で表す。
 */
export type GuardedSession = AuthenticatedSession & {
  account: NonNullable<AuthenticatedSession["account"]>;
};

/**
 * 有効なセッション（account情報を含む）を取得する。
 * セッションが無効・未ログインの場合はログイン画面へリダイレクトする。
 */
export async function getAuthenticatedSessionServer(): Promise<GuardedSession> {
  const session = await getSessionServer();
  const account = session?.account;

  if (!session || !account) {
    redirect("/login");
  }

  return { ...session, account };
}
