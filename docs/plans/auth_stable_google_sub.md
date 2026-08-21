# Google subを安定したproviderAccountIdとして保存する改善計画(未着手)

このファイルは作業単位の一時的な引き継ぎ資料であり、`docs/global_design/`の設計書と同格には扱わない。作業完了後は削除してよい。

**ステータス: 未着手。MVP実装を優先するため、2026-08-21時点では見送りと合意済み。着手する場合はこのファイルを計画として使う。**

## 背景(経緯の要約)

詳しい調査過程・不採用にした案の全履歴は`docs/plans/external_implementation.md`「認証」節を参照。ここではこの改善案に直接関係する部分のみ要約する。

- database未設定のBetter Auth stateless構成では、`user.id`(＝Googleログインのたびに`providerAccountId`として渡していた値)が**ログインのたびに毎回別の値になる**ことが実機で確認された(Better Auth GitHub Issue #6447/PR #9979で言及されている既知の挙動)
- そのため`AccountService.createOrGetAccount`の既存アカウント検索を、当初の`provider` + `providerAccountId`から`email`に変更して解消した(2026-08-21実装・動作確認済み)
- この結果、`accounts.provider_account_id`列(UNIQUE制約あり)には、初回登録時にBetter Authが生成した**使い捨ての値が固定されたまま残り**、本来保存したかったGoogleの安定した`sub`(OIDC仕様上不変)は保存できていない

## 試して失敗した方法(再挑戦不要)

以下2つは実機で検証し、stateless構成では機能しないことを確認済み。同じ方法を再度試す必要はない。

1. `advanced.database.generateId: false` — 公式リファレンスは「databaseがIDを生成する」という説明のみでstateless時の挙動は未文書化。内部実装への依存度が高く不採用
2. `socialProviders.google.mapProfileToUser`で`profile.sub`を独自フィールド(`googleSub`)として返し、`user.additionalFields`で宣言する案 — `additionalFields`のキー自体は`newSession.user`に現れるが、値は`undefined`になった。stateless構成では、DBへの書き込み・読み直しを経由する永続化経路がないため、customフィールドの値が失われると考えられる

## 提案する改善案(未検証・次に試すべき方法)

**`mapProfileToUser`のコールバック関数の中で、直接`createOrGetAccountCommand`を呼ぶ。**

```ts
// features/auth/lib/better-auth.ts（イメージ）
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    mapProfileToUser: async (profile) => {
      await createOrGetAccountCommand({
        email: profile.email,
        name: profile.name,
        provider: "google",
        providerAccountId: profile.sub, // Googleの安定したsubをそのまま使う
        thumbnail: profile.picture,
      });
      return {};
    },
  },
},
```

### なぜこれで解決する可能性があるか

- `mapProfileToUser`は、Better Authの内部状態(`user`オブジェクト)を経由する前に、Googleの生の`profile`(`sub`含む)を直接受け取れる。値をBetter Auth側に「運ばせる」必要がないため、これまで2案が失敗した原因(stateless構成でcustomフィールドの永続化経路がない)を回避できる
- `mapProfileToUser`はOAuthコールバック処理(実際のGoogleとのトークン交換)の中でのみ呼ばれ、`getSession()`のたびには呼ばれない。そのため「実際にログインした時だけ実行する」という`hooks.after`(`ctx.context.newSession`検知)と同じ性質を、追加の判定ロジックなしに自然に満たせる可能性がある

### stateless構成への影響について

「statelessでなくなるのでは」という懸念を検討済み。結論: 影響なし。`08_authentication.md`の「stateless」はBetter Auth自身のセッション管理方式(Cookieベースか、自前のsessions/users/accountsテーブルを持つか)を指す用語であり、アプリケーション側が自分の`accounts`テーブルに書き込むかどうかとは無関係。現状の`hooks.after`もすでに同じ`createOrGetAccountCommand`でDBに書き込んでおり、`mapProfileToUser`に移しても書き込み先・内容は変わらず、トリガーするフックの種類が変わるだけ。`betterAuth()`に`database`オプションを渡さない点も変更しない。

### 実現できれば可能になること

- `accounts.provider_account_id`に本物のGoogle `sub`を保存できる
- `AccountService.createOrGetAccount`の検索キーを、`email`から元々の設計意図だった`provider` + `providerAccountId`に戻せる可能性がある(CLAUDE.mdの「Account実装で確立したパターン」に沿う)

### 未検証・着手時に確認すべきこと

- `mapProfileToUser`が非同期関数として、副作用(DB書き込み)を伴う実装で問題なく動作するか実機で確認する
- 新規ユーザー・既存ユーザーどちらのログインでも毎回呼ばれるか(呼ばれない場合、返り値だけ返して別途`hooks.after`相当のトリガーが必要になる)。ソースコード(`getUserInfo`実装)の構造上、新規/既存を判定する前段階でGoogleのprofileをuserの形にマッピングする処理のため、毎回呼ばれるはずだが未検証
- `hooks.after`を完全に置き換えるか、フォールバック/安全網として残すか
- **`lastLoginAt`の意味的な正確さへの影響**: `hooks.after`の`ctx.context.newSession`は、セッションが実際に確立し終わった**後**にしかセットされないため、「ログインが完全に成功した」ことを保証してから`lastLoginAt`を更新できる。一方`mapProfileToUser`は、Better Auth内部の新規/既存ユーザー判定やセッション確立より**手前**で呼ばれる。理論上、`mapProfileToUser`が呼ばれた後に何らかの理由でログイン処理自体が失敗しても、その時点で`accounts`テーブルへの書き込み(`lastLoginAt`更新)は実行されてしまっている可能性がある。このアプリはGoogle単一プロバイダーで`disableSignUp`等の複雑な分岐もないため実害は出にくいと考えられるが、「lastLoginAt=本当にログインが成功した時刻」という意味的な正確さでは`hooks.after`方式の方が厳密。着手時はこのトレードオフを踏まえて判断する
- `provider` + `providerAccountId`検索に戻した場合、`docs/plans/external_implementation.md`に記載した「同時に2つの新規登録リクエストが来た場合の競合(race condition)」が同様に発生する(検索キーが変わるだけで、SELECT→分岐というアトミックでない構造自体は変わらないため)。この既知の問題への対応方針は別途検討する
- `AccountRepository.findByProviderAccount`(現在未使用)を再び使うことになる

## 意思決定の記録

2026-08-21、ユーザーと合意: MVP実装を優先するため今回は着手せず、このファイルを計画として残し、後日着手する。
