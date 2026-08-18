"use client";

import { useRouter } from "next/navigation";

/**
 * ログイン処理のスタブ。
 *
 * 本来は signIn.social({ provider: "google", callbackURL: "/notes" })
 * (Better Auth) を呼び出す想定だが、Better Auth未導入のため
 * クライアント側遷移のみ行う。導入後はこの関数の中身を置き換える。
 */
export function useLoginClient() {
  const router = useRouter();

  const handleLogin = () => {
    router.push("/notes");
  };

  return { handleLogin };
}
