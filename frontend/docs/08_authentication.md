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

`socialProviders.google.onSuccess`は削除し、アカウント作成は`customSession`のフォールバック処理に一本化しています（理由は後述）。

```
┌─────────────────────────────────────────────────────────────────┐
│                        認証フロー                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ユーザー                                                        │
│     │                                                           │
│     ▼                                                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ ログイン    │───▶│ Google     │───▶│ コールバック │         │
│  │ ボタン     │    │ OAuth 2.0  │    │ /api/auth/* │         │
│  └─────────────┘    └─────────────┘    └──────┬──────┘         │
│                                               │                 │
│                                               ▼                 │
│                                        ┌─────────────┐         │
│                                        │ Better Auth │         │
│                                        │ (stateless) │         │
│                                        └──────┬──────┘         │
│                                               │                 │
│                      ┌────────────────────────┼────────────┐   │
│                      ▼                        ▼            ▼   │
│               ┌─────────────┐         ┌─────────────┐  ┌─────┐│
│               │customSession│         │ Cookie保存  │  │(以降│
│               │ (毎回実行)  │         │             │  │も同じ)││
│               └──────┬──────┘         └─────────────┘  └─────┘│
│                      ▼                                         │
│               ┌─────────────┐                                 │
│               │unstable_cache│                                │
│               │(5分キャッシュ)│                                │
│               │ →なければ    │                                │
│               │   その場で作成│                                │
│               └──────┬──────┘                                 │
│                      ▼                                         │
│               ┌─────────────────────────────────────┐         │
│               │         accounts テーブル           │         │
│               │    (id, email, provider, etc.)     │         │
│               └─────────────────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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

### 4. customSession プラグイン（毎回実行、アカウント作成もここに一本化）

注記（変更履歴）

- 以前は`socialProviders.google.onSuccess`で初回ログイン時にアカウントを作成していましたが、`customSession`のフォールバック処理と役割が重複していたため削除しました
- `onSuccess`はBetter Auth公式のOptions Referenceの`socialProviders`項目一覧に記載がなく、公式サポートを確認できませんでした
- `customSession`は公式ドキュメントに「セッションが取得されるたびに呼ばれる」と明記されており、ログイン直後にも必ず呼ばれるため、アカウント作成を一本化しても初回ログイン時の動作は変わりません
- フォールバック内で、アカウント作成後に`getAccountByEmailQuery`で再取得していた処理も削除しました
  - `createOrGetAccountCommand`は内部で`accountService.createOrGet()`（作成/更新直後のデータをRETURNINGで直接返す）を呼んでおり、戻り値自体がすでに最新のアカウント情報です
  - 再取得は無駄なDBラウンドトリップであるだけでなく、書き込みと読み取りの間に別リクエストが割り込む余地を作る点でもメリットがありませんでした

```ts
// features/auth/lib/better-auth.ts
customSession(async ({ user, session }) => {
  // unstable_cache でDBアクセスをキャッシュ（5分）
  let account = await getCachedAccount(user.email);

  if (account) {
    return { user, session, account };
  }

  // アカウントが存在しない場合（初回ログイン含む）はここで作成
  // createOrGetAccountCommand の戻り値をそのまま使う（再取得しない）
  const createdAccount = await createOrGetAccountCommand({
    email: user.email,
    name: user.name || user.email,
    provider: "google",
    providerAccountId: user.id,
    thumbnail: user.image || undefined,
  });

  return { user, session, account: createdAccount };
})

// features/auth/lib/better-auth.ts（socialProvidersはOAuth情報のみを持つ）
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },
}
```

### 5. セッション取得

```ts
// features/auth/servers/auth.server.ts
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
declare module "better-auth" {
  interface Session {
    account?: Account;
  }
}
```

これにより`session.account`でアカウント情報にアクセス可能。

## 認証ガード

サーバーコンポーネント

```ts
// features/auth/servers/redirect.server.ts
export async function requireAuthServer(): Promise<Session> {
  const session = await getSessionServer();
  if (!session?.account?.id) {
    redirect("/login");
  }
  return session;
}
```

使用例

```tsx
// app/(authenticated)/notes/page.tsx
export default async function NotesPage() {
  const session = await requireAuthServer();
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
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    thumbnail: text("thumbnail"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("accounts_email_idx").on(table.email),
    providerIdx: uniqueIndex("accounts_provider_idx").on(
      table.provider,
      table.providerAccountId
    ),
  })
);
```

ユニーク制約

| 制約 | カラム | 目的 |
| --- | --- | --- |
| accounts_email_idx | email | メールアドレスの重複防止 |
| accounts_provider_idx | (provider, provider_account_id) | 同一プロバイダの重複防止 |

## 重複アカウント処理

同じユーザーが再ログインした場合の処理：

```ts
// external/repository/account/account-repository.ts
.onConflictDoUpdate({
  target: [accounts.provider, accounts.providerAccountId],
  set: {
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    thumbnail: data.thumbnail,
    lastLoginAt: new Date(),
    updatedAt: new Date(),
  },
})
```

これにより：

- 新規ユーザー → INSERT
- 既存ユーザー → UPDATE（lastLoginAt 更新）

## ファイル構成

```
features/auth/
├── lib/
│   ├── better-auth.ts        # サーバー側設定
│   └── better-auth-client.ts # クライアント側設定
├── servers/
│   ├── auth.server.ts        # getSessionServer
│   └── redirect.server.ts    # requireAuthServer
├── types/
│   └── better-auth.d.ts      # 型定義（Module Augmentation）
└── components/
    ├── client/
    │   └── LoginPageClient/  # ログインUI
    └── server/
        └── LoginPageTemplate/

external/handler/account/
├── account.command.server.ts # createOrGetAccountCommand
└── account.query.server.ts   # getAccountByEmailQuery
```

## トラブルシューティング

セッションが取得できない

- Cookieが正しく設定されているか確認
- `BETTER_AUTH_SECRET` が設定されているか確認
- `NEXTAUTH_URL` が正しいか確認

アカウントが作成されない

- データベース接続を確認
- `accounts` テーブルが存在するか確認（`pnpm db:push`）
- ユニーク制約違反がないか確認

customSession でエラー

- `getAccountByEmailQuery` がnullを返していないか確認
- `unstable_cache` のタグが正しいか確認
- handler → service → repository の呼び出し順序を確認
