import "server-only";
import type { Session } from "better-auth";
import { headers } from "next/headers";
import { auth } from "../lib/better-auth";

/**
 * 実装方針: frontend/docs/08_authentication.md「セッション取得」
 *
 * better-authの`Session`型(features/auth/types/better-auth.d.tsでaccountを拡張済み)。
 */
export type AuthenticatedSession = Session;

/**
 * 現在のセッションを取得する。
 */
export async function getSessionServer(): Promise<AuthenticatedSession | null> {
  return await auth.api.getSession({ headers: await headers() });
}
