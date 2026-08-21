import "server-only";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { customSession } from "better-auth/plugins";
import { unstable_cache } from "next/cache";
import { createOrGetAccountCommand } from "../../../external/handler/account/account.command.server";
import { getAccountByEmailQuery } from "../../../external/handler/account/account.query.server";

/**
 * customSession(読み取り専用)からのアカウント参照用。unstable_cacheでDBアクセスを
 * キャッシュ(5分)し、セッション確認のたびにDBへ問い合わせるのを避ける。
 *
 * アカウントの作成・lastLoginAt更新はここでは行わない(下記hooks.after参照)。
 * このキャッシュはあくまで「読み取りの節約」であり、「本当に新しいログインが
 * 起きたか」の判定には使わない(customSessionは`getSession`のたびに呼ばれるため、
 * ここでcreateOrGetAccountCommandを呼ぶと、ログインし直していなくてもセッション
 * 確認のたびにlastLoginAtが更新されてしまい、06_database_design.mdの
 * 「最終ログイン時刻」という定義と食い違う)。
 */
const getCachedAccount = unstable_cache(
  (email: string) => getAccountByEmailQuery(email),
  ["account-by-email"],
  {
    revalidate: 300,
    tags: ["account"],
  },
);

/**
 * database未設定のため自動的にstateless構成になる(better-auth公式ドキュメント
 * 「Stateless Session Management」参照)。secret/baseURLは環境変数
 * (BETTER_AUTH_SECRET/BETTER_AUTH_URL)から自動検出される。
 *
 * socialProviders.googleにonSuccessは持たせない(未実装の理由はfrontend/docs/08_authentication.md参照)。
 * アカウント作成・lastLoginAt更新はhooks.afterに一本化する(下記参照)。
 *
 * 注記: このstateless構成ではuser.idがログインのたびに変わる(Better Auth GitHub
 * Issue #6447/PR #9979。実機でも確認済み。mapProfileToUserで独自フィールドに
 * Googleのsubを捕まえる案も試したがstateless構成では値が失われ不採用)。そのため
 * providerAccountIdは「DBのNOT NULL制約を満たすための、意味を持たない値」として
 * newSession.user.idをそのまま渡すのみとし、既存アカウントの検索キーには使わない
 * (検索はAccountService.createOrGetAccountがemailで行う。
 * docs/plans/external_implementation.md「認証」節に経緯を記載)。
 */
export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  /**
   * 「実際にログインが起きた」ことの検知はcustomSessionでは行えない
   * (customSessionは既存セッションの確認時にも毎回呼ばれるため)。
   *
   * better-authのsetSessionCookie()(サインイン系エンドポイント共通のユーティリティ。
   * OAuthコールバックも含む)は、セッションを確立するたびに必ず
   * `ctx.context.setNewSession(session)`を呼ぶ。これによりhooks.after内で
   * `ctx.context.newSession`を見れば「たった今新しいセッションが作られたか」を
   * 確実に判定できる(better-authソースで確認済み)。
   *
   * このアプリはsocialProviders.googleのみのため、newSessionが立つのは
   * 常にGoogleサインイン経由。
   */
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const newSession = ctx.context.newSession;
      if (!newSession) {
        return;
      }

      await createOrGetAccountCommand({
        email: newSession.user.email,
        name: newSession.user.name || newSession.user.email,
        provider: "google",
        providerAccountId: newSession.user.id,
        thumbnail: newSession.user.image || undefined,
      });
    }),
  },
  plugins: [
    customSession(async ({ user, session }) => {
      const account = await getCachedAccount(user.email);
      return { user, session, account: account ?? undefined };
    }),
  ],
});
