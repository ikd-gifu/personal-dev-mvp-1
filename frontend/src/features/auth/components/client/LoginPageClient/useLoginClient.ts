"use client";

import { signIn } from "../../../lib/better-auth-client";

/**
 * 実装方針: frontend/docs/08_authentication.md「1. ログインボタンクリック」
 */
export function useLoginClient() {
  const handleLogin = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: "/notes",
    });
  };

  return { handleLogin };
}
