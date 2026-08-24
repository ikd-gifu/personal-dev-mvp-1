"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/features/auth/lib/better-auth-client";

/**
 * 実装方針: frontend/docs/08_authentication.md「ログアウト」
 */
export function useHeader() {
  const router = useRouter();
  const { data } = useSession();

  const handleLogout = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => router.push("/login"),
      },
    });
  };

  return { account: data?.account, handleLogout };
}
