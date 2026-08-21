import { customSessionClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./better-auth";

/**
 * customSessionClientはbetter-auth.tsのcustomSession(account拡張)を
 * クライアント側で型推論するために必要(better-auth公式ドキュメント参照)。
 */
export const authClient = createAuthClient({
  plugins: [customSessionClient<typeof auth>()],
});

export const { signIn, signOut, useSession } = authClient;
