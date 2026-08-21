import type { AccountResponse } from "../../../external/dto/account/account-dto";

/**
 * 実装方針: frontend/docs/08_authentication.md「型定義(Module Augmentation)」
 * customSession(features/auth/lib/better-auth.ts)が返すaccountを
 * session.accountとして型付けする。
 */
declare module "better-auth" {
  interface Session {
    account?: AccountResponse;
  }
}
