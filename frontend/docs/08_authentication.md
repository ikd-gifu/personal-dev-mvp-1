# 認証システム実装ガイド

## 概要

Better Auth を使用した認証システム。Google OAuth 2.0 による認証と、stateless セッション管理を採用。

## 技術スタック

| 項目 | 技術 |
| --- | --- |
| 認証ライブラリ | Better Auth |
| OAuth プロバイダ | Google OAuth 2.0 |
| セッション管理 | Stateless（Cookie ベース） |
| ユーザーデータ | PostgreSQL（accounts テーブル） |
| キャッシュ | Next.js unstable_cache |

## アーキテクチャ

`socialProviders.google.onSuccess`は使わず、また`customSession`にアカウント作成/更新を持たせる設計も不採用とし、**書き込み(アカウント作成/更新)は`hooks.after`、読み取り(セッションへのアカウント付与)は`customSession`**に役割を分離しています（経緯・不採用にした理由は後述）。

```
┌───────────────────────────────────────────────────────────────────────┐
│                              認証フロー                                │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ユーザー                                                              │
│     │                                                                 │
│     ▼                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
│  │ ログイン    │───▶│ Google     │───▶│ コールバック │               │
│  │ ボタン     │    │ OAuth 2.0  │    │ /api/auth/* │               │
│  └─────────────┘    └─────────────┘    └──────┬──────┘               │
│                                               │                       │
│                                               ▼                       │
│                                        ┌─────────────┐               │
│                                        │ setSessionCookie│           │
│                                        │ (新セッション確立)│         │
│                                        └──────┬──────┘               │
│                                               ▼                       │
│                                     ┌───────────────────┐            │
│                                     │ hooks.after        │            │
│                                     │ ctx.context.newSession│         │
│                                     │ があれば(=今ログインした)│      │
│                                     │ createOrGetAccountCommand│      │
│                                     │ (email検索→INSERT/UPDATE)│     │
│                                     └──────────┬────────┘            │
│                                                ▼                      │
│                                     ┌─────────────────────┐          │
│                                     │   accounts テーブル  │          │
│                                     └─────────────────────┘          │
│                                                                       │
│  （以降、getSession()が呼ばれるたび、新規ログインの有無に関わらず）      │
│                                     ┌─────────────────────┐          │
│                                     │ customSession(読み取り専用)│    │
│                                     │ unstable_cacheでaccount   │    │
│                                     │ をemail検索してsessionに付与│  │
│                                     └─────────────────────┘          │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Stateless セッションとは

従来の認証（Stateful）との違い：

| 項目 | Stateful | Stateless（採用） |
| --- | --- | --- |
| セッション保存 | DB（sessions テーブル） | Cookie（署名付き） |
| DBアクセス | 毎リクエスト | 不要 |
| スケーラビリティ | サーバー間で共有必要 | 各サーバーで独立処理可能 |
| ログアウト | DBから削除 | Cookie削除のみ |

メリット

- DBへのセッション問い合わせが不要（高速）
- 水平スケーリングが容易
- sessionsテーブルが不要

デメリット

- サーバー側から強制ログアウトが難しい
- セッションデータの即時更新が難しい

## 処理フロー詳細

### 1. ログインボタンクリック

```ts
// features/auth/components/client/LoginPageClient/useLoginClient.ts
const handleLogin = async () => {
  await signIn.social({
    provider: "google",
    callbackURL: "/notes",  // ログイン後のリダイレクト先
    // newUserCallbackURL: "/welcome", // 新規ユーザーのみ別ページに出したい場合は任意で追加（公式ドキュメントに記載あり）
  });
};
```

### 2. Google OAuth 認証

1. ユーザーがGoogleのログイン画面にリダイレクト
2. Googleアカウントでログイン
3. 認可コードがコールバックURLに返される
4. Better Authがアクセストークンを取得

### 3. Better Auth コールバック処理

```ts
// app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/features/auth/lib/better-auth";

export const { GET, POST } = toNextJsHandler(auth);
```

### 4. hooks.after（書き込み）と customSession（読み取り）の役割分離

注記（変更履歴。過去に不採用にした設計とその理由）

- 当初、`socialProviders.google.onSuccess`で初回ログイン時にアカウントを作成する案があったが、`onSuccess`はBetter Auth公式のOptions Referenceの`socialProviders`項目一覧に記載がなく不採用
- 次に、`customSession`内で「`unstable_cache`のキャッシュがあれば返し、なければ`createOrGetAccountCommand`で作成」という一本化案を実装したが、**実運用で不具合が2件見つかり不採用**にした
  - **不具合1**: `customSession`は公式ドキュメントに「セッションが取得されるたびに呼ばれる」と明記されている通り、実際のログインの有無に関わらず`getSession()`のたびに毎回呼ばれる。一度アカウントが作成されると、以降は必ずキャッシュ(またはDBの直接読み取り)がヒットするため、`createOrGetAccountCommand`(lastLoginAt更新処理)が**初回ログイン後二度と呼ばれなくなる**
  - **不具合2**: database未設定のstateless構成では、`user.id`(≒`providerAccountId`として使っていた値)がログインのたびに毎回別の値になる(Better Auth GitHub Issue #6447/PR #9979で言及されている既知の挙動)。これを検索キーにしていたため、2回目以降のログインで既存アカウントを見つけられず、`email`のUNIQUE制約違反で500エラーになっていた
  - 詳しい調査過程は`docs/plans/external_implementation.md`「認証」節を参照
- **採用した設計**: better-authの`hooks.after`(`createAuthMiddleware`)を使い、「実際に新しいセッションが作られたか」を`ctx.context.newSession`の有無で判定する。`setSessionCookie()`(サインイン系エンドポイント共通のユーティリティ。OAuthコールバックも含む)はセッション確立のたびに必ず`ctx.context.setNewSession(session)`を呼ぶため、これで「本当にログインしたタイミング」だけを確実に検知できる(better-authソースで確認済み)。`customSession`は読み取り専用に戻し、書き込みは一切行わない

```ts
// features/auth/lib/better-auth.ts

// 読み取り専用。unstable_cacheでDBアクセスをキャッシュ（5分）。
// 書き込みは一切行わない（hooks.afterに一本化。理由は上記参照）。
const getCachedAccount = unstable_cache(
  (email: string) => getAccountByEmailQuery(email),
  ["account-by-email"],
  { revalidate: 300, tags: ["account"] },
);

export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // 書き込み: 「実際に新しいセッションが作られた」瞬間だけ実行される
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const newSession = ctx.context.newSession;
      if (!newSession) return;

      await createOrGetAccountCommand({
        email: newSession.user.email,
        name: newSession.user.name || newSession.user.email,
        provider: "google",
        // 注意: newSession.user.idはstateless構成では安定しないため、
        // NOT NULL制約を満たすためだけの値。既存アカウントの検索キーには
        // 使わない（AccountService.createOrGetAccountはemailで検索する）
        providerAccountId: newSession.user.id,
        thumbnail: newSession.user.image || undefined,
      });
    }),
  },
  // 読み取り: getSession()のたびに毎回呼ばれる。書き込みはしない
  plugins: [
    customSession(async ({ user, session }) => {
      const account = await getCachedAccount(user.email);
      return { user, session, account: account ?? undefined };
    }),
  ],
});
```

### 5. セッション取得

```ts
// features/auth/servers/session.server.ts
export async function getSessionServer(): Promise<Session | null> {
  return await auth.api.getSession({ headers: await headers() });
}
```

## キャッシュ戦略

サーバーサイド（unstable_cache）

```ts
const getCachedAccount = unstable_cache(
  async (email: string): Promise<Account | null> => {
    return await getAccountByEmailQuery(email);
  },
  ["account-by-email"],
  {
    revalidate: 300, // 5分間キャッシュ
    tags: ["account"],
  }
);
```

| 設定 | 値 | 説明 |
| --- | --- | --- |
| revalidate | 300秒 | キャッシュの有効期間 |
| tags | ["account"] | revalidateTag で無効化可能 |

クライアントサイド（Cookie Cache）

```ts
session: {
  cookieCache: {
    enabled: true,
    maxAge: 5 * 60, // 5分間
  },
}
```

セッション情報をCookieにキャッシュし、毎回のDB/API呼び出しを削減。

型定義（Module Augmentation）

```ts
// features/auth/types/better-auth.d.ts
import type { AccountResponse } from "../../../external/dto/account/account-dto";

declare module "better-auth" {
  interface Session {
    account?: AccountResponse;
  }
}
```

これにより`session.account`でアカウント情報にアクセス可能。`Account`ではなくDTO(`AccountResponse`)を使う理由: `customSession`は`external/handler`層(DTO変換済み)を経由してaccountを返すため。

## 認証ガード

サーバーコンポーネント

```ts
// features/auth/servers/redirect.server.ts
export async function getAuthenticatedSessionServer(): Promise<GuardedSession> {
  const session = await getSessionServer();
  const account = session?.account;

  if (!session || !account) {
    redirect("/login");
  }

  return { ...session, account };
}
```

（`GuardedSession`は`AuthenticatedSession & { account: NonNullable<AuthenticatedSession["account"]> }`。ガード通過後はaccountが保証されていることを型で表す）

使用例（`app/(authenticated)/`ルートグループは未実装。ステップ8で導入予定。それまでは各ページが個別に呼ぶ）

```tsx
export default async function NotesPage() {
  const session = await getAuthenticatedSessionServer();
  // session.account.id が保証されている
}
```

## 環境変数

```
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Better Auth
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-secret-key
```

## データベーススキーマ

```ts
// external/client/database/schema.ts
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    thumbnail: text("thumbnail"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [unique().on(table.provider, table.providerAccountId)],
);
```

ユニーク制約

| 制約 | カラム | 目的 |
| --- | --- | --- |
| email(`.unique()`) | email | メールアドレスの重複防止 |
| (provider, providerAccountId)(`unique()`) | (provider, provider_account_id) | 同一プロバイダの重複防止(初回登録時のみ有効。上記「重複アカウント処理」参照) |

## 重複アカウント処理

同じユーザーが再ログインした場合の処理は、DB側の`onConflictDoUpdate`ではなく、アプリケーション層(`AccountService`)で明示的にINSERT/UPDATEを分岐する：

```ts
// external/service/account/account-service.ts
async createOrGetAccount(profile: {...}): Promise<Account> {
  const existing = await this.accountRepository.findByEmail(profile.email);

  if (existing) {
    const updated = existing.updateOnLogin({ firstName, lastName, thumbnail }, now);
    await this.accountRepository.save(updated); // UPDATE
    return updated;
  }

  const created = await this.accountRepository.newCreate({...}); // INSERT
  const withLoginRecorded = created.updateOnLogin({ firstName, lastName, thumbnail }, now);
  await this.accountRepository.save(withLoginRecorded);
  return withLoginRecorded;
}
```

既存アカウントの検索キーが`email`である理由: `provider` + `providerAccountId`ではなく`email`で検索している。当初は`provider` + `providerAccountId`(`accounts_provider_idx`のUNIQUE制約に対応)で検索していたが、database未設定のBetter Auth stateless構成では`providerAccountId`の元になる値(`user.id`)がログインのたびに変わるため機能しなかった(詳細は上記「4. hooks.after」節、経緯は`docs/plans/external_implementation.md`「認証」節参照)。`accounts_provider_idx`制約自体はDBに残っているが、初回登録時の値が固定されるだけで、以降の検索には使われない。

## ファイル構成

```
features/auth/
├── lib/
│   ├── better-auth.ts        # サーバー側設定（hooks.after / customSession）
│   └── better-auth-client.ts # クライアント側設定
├── servers/
│   ├── session.server.ts     # getSessionServer
│   ├── redirect.server.ts    # getAuthenticatedSessionServer
│   └── auth.guard.ts         # withAuth（Server Actionからの利用）
├── types/
│   └── better-auth.d.ts      # 型定義（Module Augmentation）
└── components/
    ├── client/
    │   └── LoginPageClient/  # ログインUI
    └── server/
        └── LoginPageTemplate/

external/handler/account/
├── account.command.server.ts # createOrGetAccountCommand
└── account.query.server.ts   # getAccountByIdQuery, getAccountByEmailQuery
```

## トラブルシューティング

セッションが取得できない

- Cookieが正しく設定されているか確認
- `BETTER_AUTH_SECRET` が設定されているか確認
- `BETTER_AUTH_URL` が正しいか確認

アカウントが作成/更新されない

- `hooks.after`が発火しているか確認（`ctx.context.newSession`が存在するのは、実際に新しいセッションが作られた1リクエストのみ。`/api/auth/get-session`を単に叩いただけでは発火しない）
- データベース接続を確認
- `accounts` テーブルが存在するか確認（`pnpm db:generate` / `pnpm db:migrate`）
- `AccountService.createOrGetAccount`が`email`で正しく既存アカウントを検索できているか確認（`providerAccountId`はstateless構成では安定しないため検索キーに使わない。上記「重複アカウント処理」参照）

customSession でエラー

- `getAccountByEmailQuery` がnullを返していないか確認
- `unstable_cache` のタグが正しいか確認
- handler → service → repository の呼び出し順序を確認
- `customSession`はあくまで読み取り専用。アカウントの作成/更新がここで行われることはない（上記「4. hooks.after」参照）
