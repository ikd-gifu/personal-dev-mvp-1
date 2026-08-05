import "server-only";

/**
 * 認証済みセッション。
 *
 * 未実装のプレースホルダ。better-auth導入後、実際のセッション型
 * （better-authの`Session`）に差し替える。
 */
export interface AuthenticatedSession {
  account: {
    id: string;
  };
}

/**
 * 現在のセッションを取得する。
 *
 * 未実装のプレースホルダ。認証基盤（better-auth等）が未導入のため、
 * セッションを取得する処理はまだ存在しない。
 * 導入後、`auth.api.getSession({ headers: await headers() })`相当の
 * 実装に差し替える。
 */
export async function getSessionServer(): Promise<AuthenticatedSession | null> {
  throw new Error("getSessionServer is not implemented yet");
}
