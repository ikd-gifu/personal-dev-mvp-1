# Google subを安定したproviderAccountIdとして保存する改善計画(未着手)

このファイルは作業単位の一時的な引き継ぎ資料であり、`docs/global_design/`の設計書と同格には扱わない。作業完了後は削除してよい。

**ステータス: 未着手。MVP実装を優先するため、2026-08-21時点では見送りと合意済み。着手する場合はこのファイルを計画として使う。候補は案A・案B・案Cの3つがあり、案C(`ctx.context.internalAdapter.findAccounts()`で同一リクエスト内から読む。ユーザーが`node_modules`のソースを直接調査して発見)が最有力。2026-08-22、`features/auth/lib/better-auth.ts`にデバッグログを仕込んだ実機検証により、案Cが実際に動作すること(Googleのsubを正しく取得できること)を確認済み。ただし`internalAdapter`はBetter Auth内部APIであり長期的な安定性は保証されないため、着手時は本採用前に下記「2026-08-22追加調査」を確認すること。**

## 背景(経緯の要約)

詳しい調査過程・不採用にした案の全履歴は`docs/plans/external_implementation.md`「認証」節を参照。ここではこの改善案に直接関係する部分のみ要約する。

- database未設定のBetter Auth stateless構成では、`user.id`(＝Googleログインのたびに`providerAccountId`として渡していた値)が**ログインのたびに毎回別の値になる**ことが実機で確認された(Better Auth GitHub Issue #6447/PR #9979で言及されている既知の挙動)
- そのため`AccountService.createOrGetAccount`の既存アカウント検索を、当初の`provider` + `providerAccountId`から`email`に変更して解消した(2026-08-21実装・動作確認済み)
- この結果、`accounts.provider_account_id`列(UNIQUE制約あり)には、初回登録時にBetter Authが生成した**使い捨ての値が固定されたまま残り**、本来保存したかったGoogleの安定した`sub`(OIDC仕様上不変)は保存できていない

## 試して失敗した方法・不可能と判明した方法(再挑戦不要)

以下は実機検証またはソースコード調査で、stateless構成では機能しない・実現不可能と判明済み。同じ方法を再度試す必要はない。

1. `advanced.database.generateId: false` — 公式リファレンスは「databaseがIDを生成する」という説明のみでstateless時の挙動は未文書化。内部実装への依存度が高く不採用
2. `socialProviders.google.mapProfileToUser`で`profile.sub`を独自フィールド(`googleSub`)として返し、`user.additionalFields`で宣言する案 — `additionalFields`のキー自体は`newSession.user`に現れるが、値は`undefined`になった。stateless構成では、DBへの書き込み・読み直しを経由する永続化経路がないため、customフィールドの値が失われると考えられる
3. `mapProfileToUser`の中で、自前の署名付きCookieを直接読み書きする案 — better-authソース(`packages/core/src/social-providers/google.ts`)で`mapProfileToUser`の呼び出し箇所を確認したところ、`options.mapProfileToUser?.(user)`と**引数は`profile`(user)のみ**で、Cookie操作に必要な`ctx`(リクエスト/レスポンスコンテキスト)は渡されないことが判明。この関数の中からはCookieの読み書きができないため、実現不可能

## 改善案の候補

### 案A: mapProfileToUserから直接createOrGetAccountCommandを呼ぶ(採用にあたって要対応の制約あり)

**`mapProfileToUser`のコールバック関数の中で、直接`createOrGetAccountCommand`を呼ぶ。**

```ts
// features/auth/lib/better-auth.ts（イメージ。下記の理由によりこのままでは不採用）
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

#### 案Aの制約(データ整合性。2026-08-21追記、2026-08-21再精査により表現を訂正)

当初「セキュリティ上のリスク」と表現していたが、再精査の結果、悪用可能な脆弱性ではなく、**限定的な条件下でのデータ整合性の問題**であることが分かった(以下、ユーザーによる精査結果)。

- **悪用可能性はない**: `mapProfileToUser`が呼ばれるのは、`validateAuthorizationCode`(PKCE付きのcode_verifier・client_secretを使ったサーバー間通信)が成功した**後**。これは攻撃者が偽造できないため、`mapProfileToUser`に到達した時点で「実在するGoogleアカウントで本人が正当に認証を完了した」ことは保証されている
  - 攻撃者が任意のメールアドレスで`account`行を偽造・量産することはできない(実在のGoogleアカウントを1つ消費して初めて1行書き込めるだけ)
  - `account`行が存在するだけではセッションCookieは発行されず、ログイン状態にもならない(この後の処理が失敗すればセッションは作られない)
  - ドメイン制限のような、書き込み前に評価すべきビジネスルールは`createOrGetAccountCommand`内部で評価される設計にしておけば、許可されないユーザーはこの書き込み自体が失敗し、`account`行は残らない
  - つまり「認可されていないユーザーが権限を得る」「セッションを乗っ取る」といった意味での実害はない
- **残るのはデータ整合性の問題**: Google側の認証は成功したが、その後Better Auth内部(セッション発行など)が何らかの理由で失敗した場合、「一度もログインを完了していないのに`account`行だけ存在し、`lastLoginAt`も更新されている」という孤立レコードが残り得る。これはセキュリティではなく監査ログの正確性の問題
- **実害が顕在化する条件**: 現状の機能には影響しないが、将来「`account`行の存在＝このユーザーは過去に本当にログインした」という前提でロジックを組んだ場合(例: 招待制・承認制フローで「未承認ユーザーには`account`行を作らない」ことを前提にした分岐)に問題が顕在化する

**この制約を解消しない限り、上記コード例のように`mapProfileToUser`から`lastLoginAt`更新を含む書き込みを直接行う形では採用しない**(セキュリティ上必須ではないが、データ整合性を重視する場合の予防的な方針として)。着手する場合は、以下のいずれかの設計を検討すること(いずれも未検討・未設計。ただし下記「案C」であればこの制約自体が発生しないため、まず案Cを検証すべき)。

1. `mapProfileToUser`では`providerAccountId`(Googleのsub)の捕捉のみを行い、`lastLoginAt`更新は引き続き`hooks.after`(セッション確立を保証してから実行)に残す、という役割分割。ただし、捕捉した値を`mapProfileToUser`から`hooks.after`まで運ぶ手段が必要で、これは「試して失敗した方法」の2番目(`additionalFields`でstateless構成では値が失われる)と同じ壁にぶつかる可能性が高く、別の運搬方法を考える必要がある
2. `mapProfileToUser`から呼ぶ処理を「アカウントの存在保証(なければ作成。冪等で安全)」のみに限定し、`lastLoginAt`の更新は含めない専用メソッドを`AccountService`に新設する。`lastLoginAt`の更新自体は引き続き`hooks.after`で行う

#### なぜこれで解決する可能性があるか

- `mapProfileToUser`は、Better Authの内部状態(`user`オブジェクト)を経由する前に、Googleの生の`profile`(`sub`含む)を直接受け取れる。値をBetter Auth側に「運ばせる」必要がないため、これまで2案が失敗した原因(stateless構成でcustomフィールドの永続化経路がない)を回避できる
- `mapProfileToUser`はOAuthコールバック処理(実際のGoogleとのトークン交換)の中でのみ呼ばれ、`getSession()`のたびには呼ばれない。そのため「実際にログインした時だけ実行する」という`hooks.after`(`ctx.context.newSession`検知)と同じ性質を、追加の判定ロジックなしに自然に満たせる可能性がある

#### stateless構成への影響について

「statelessでなくなるのでは」という懸念を検討済み。結論: 影響なし。`08_authentication.md`の「stateless」はBetter Auth自身のセッション管理方式(Cookieベースか、自前のsessions/users/accountsテーブルを持つか)を指す用語であり、アプリケーション側が自分の`accounts`テーブルに書き込むかどうかとは無関係。現状の`hooks.after`もすでに同じ`createOrGetAccountCommand`でDBに書き込んでおり、`mapProfileToUser`に移しても書き込み先・内容は変わらず、トリガーするフックの種類が変わるだけ。`betterAuth()`に`database`オプションを渡さない点も変更しない。

#### 実現できれば可能になること

- `accounts.provider_account_id`に本物のGoogle `sub`を保存できる
- `AccountService.createOrGetAccount`の検索キーを、`email`から元々の設計意図だった`provider` + `providerAccountId`に戻せる可能性がある(CLAUDE.mdの「Account実装で確立したパターン」に沿う)

#### 案Aの未検証・着手時に確認すべきこと

- `mapProfileToUser`が非同期関数として、副作用(DB書き込み)を伴う実装で問題なく動作するか実機で確認する
- 新規ユーザー・既存ユーザーどちらのログインでも毎回呼ばれるか(呼ばれない場合、返り値だけ返して別途`hooks.after`相当のトリガーが必要になる)。ソースコード(`getUserInfo`実装)の構造上、新規/既存を判定する前段階でGoogleのprofileをuserの形にマッピングする処理のため、毎回呼ばれるはずだが未検証
- `hooks.after`を完全に置き換えるか、フォールバック/安全網として残すか
- `lastLoginAt`の意味的な正確さ・監査ログとしての信頼性への影響は上記「案Aの制約」を参照(役割分割の設計が必要)
- `provider` + `providerAccountId`検索に戻した場合、`docs/plans/external_implementation.md`に記載した「同時に2つの新規登録リクエストが来た場合の競合(race condition)」が同様に発生する(検索キーが変わるだけで、SELECT→分岐というアトミックでない構造自体は変わらないため)。この既知の問題への対応方針は別途検討する
- `AccountRepository.findByProviderAccount`(現在未使用)を再び使うことになる

### 案B: Better Auth自身のaccount_data Cookie機構(storeAccountCookie)を使う(有力・要検証。2026-08-21調査)

案Aは「`mapProfileToUser`に`ctx`が渡されずCookie操作できない」という制約があったため、**自前でCookieを実装するのではなく、Better Auth自身が既に持っている同種の仕組みを使う**方向を調査した。

**「Account」という言葉が指す2つの別概念に注意**

- **Better Auth自身の内部概念としての"Account"**(以下の`storeAccountCookie`/`accountId`/`accountInfo`はすべてこちら): DB構成であれば`account`テーブルとして永続化される、OAuthのトークン・プロバイダー情報を保持する仕組み。stateless構成ではこの永続化先が「DBテーブル」の代わりに「`account_data`という署名付きCookie」になる
- **このアプリ独自の`accounts`テーブル**(`external/client/database/schema.ts`、`AccountService`/`AccountRepository`が扱う対象): `docs/global_design/06_database_design.md`で設計した、Better Auth側の"Account"概念とは完全に別物のテーブル。命名がたまたま似ているだけ

この案Bが成立しても、**私たちの`accounts`テーブルへの書き込みロジック自体(`createOrGetAccountCommand`の呼び出し)は変わらない**。変わるのは「`providerAccountId`としてどこから値を取得するか」だけ(今: `newSession.user.id` → 案B: `account_data`Cookieから読み出した`accountId`)。Better Auth自身の内部Cookie機構を使うこと自体が、私たちの独自テーブルのスキーマや挙動に影響することはない。

**分かったこと**

- `account: { storeAccountCookie: true }`という設定(オプトイン)により、Better AuthはOAuthのaccount情報(アクセストークン等のトークン類を含む)を、署名付きの`account_data`Cookieに保存する。これはstateless構成(DBなし)でトークンを保持するための公式の仕組みで、実際にこのアプリでも(明示的に`storeAccountCookie: true`を設定していないにも関わらず)ブラウザ上に`better-auth.account_data`というCookieが存在することを確認済み(stateless構成では自動的に有効になっている可能性がある)
- Better Auth内部の`Account`スキーマには`accountId`というフィールドがあり、公式に「プロバイダー発行のアカウント識別子」と説明されている。Googleの場合、これは**まさに欲しかった安定した`sub`の値**にあたる
- `accountInfo`という専用のAPIエンドポイント(`GET /account-info`。調査時点の直近の変更で`POST`から`GET`に変更されたとの情報あり)があり、`useAccountCookie: true`を指定すると、DBなしでもこの`account_data`Cookieから情報を取得できる、との言及があった
- 「Without a database, account selection is constrained by provider identity and optional provider account id, then reused by access-token, refresh-token, account-info, and session-cache refresh flows」という記述もあり、stateless構成でもaccountId(プロバイダー発行のID)を軸にした情報取得の仕組みが設計上想定されている

**まだ検証できていないこと・懸念点**

- `hooks.after`(`ctx.context.newSession`が立つタイミング)の中から、この`accountInfo`相当の情報(`account_data`Cookieの中身)を実際に読み出せるか(APIの正確な呼び出し方法は未確認)
- この領域はBetter Auth側でも最近変更が続いており(`account-info`エンドポイントのHTTPメソッド変更など)、関連する未解決のGitHub Issue(#6770「`account_data`Cookieにaccount関連フィールドが欠落し`Account Not Found`になる」)も見つかっている。導入しているBetter Authのバージョン(1.7.1)でこれらの機能が期待通り動くか、実機での検証が必須
- `account_data`Cookieの有効期限は5分程度で、`getAccessToken`等のアクセスで更新されるとの情報があり、Cookie自体の寿命の仕様も要確認(セッション自体の寿命である7日間、安定して読み出せるとは限らない可能性がある)

**この案が成立すれば**、案Aと同じメリット(`provider_account_id`に本物のsubを保存、`provider`+`providerAccountId`検索への回帰)を得つつ、案Aで問題になった「ログイン成功前の書き込み」の懸念も回避できる可能性が高い(`hooks.after`の`newSession`確認後に読み出すだけで、書き込みタイミング自体は変えずに済むため)。

### 案C: ctx.context.internalAdapter.findAccounts()で同一リクエスト内から読む(最有力・2026-08-21ユーザー調査により発見)

ユーザーが実際にインストール済みの`node_modules`内のBetter Authソース(バンドル後のコード)を直接確認して発見した方法。案Bより不確実性が少なく、現時点で最有力の候補。

**分かったこと**

- Better Authはコールバック処理内(`google.ts`)で、Googleのuserinfoレスポンスの`sub`をそのまま`accountId: String(userInfo.id)`として、"account"レコード(userレコードとは別のオブジェクト/テーブル)に保存している(調査時点のソースで`id: user.sub`という記述を確認)
- stateless構成で使われる`internalAdapter`の実体は`memoryAdapter`(インメモリ)であり、**リクエストをまたぐと消える**(＝`user.id`がリクエストごとに毎回変わる根本原因)。しかし**同一リクエスト内ではインスタンスが保持される**
- `hooks.after`は、accountレコードが書き込まれた(`internalAdapter.createAccount()`が呼ばれた)**あと**、同じリクエストの終盤で呼ばれる。そのため、`ctx.context.internalAdapter.findAccounts(newSession.user.id)`を呼べば、Cookieという別の永続化経路を一切使わずに、同一リクエスト内で書き込まれたばかりのaccountレコード(`accountId`＝Googleの安定したsub)をそのまま読み返せる
- この`internalAdapter`経由でのaccount取得は、Better Auth公式のtwo-factor/phone-numberプラグイン自身も同じパターン(自分自身のaccountレコードを取得する)で使っている(バンドルコード内で確認)。「たまたま動く」のではなく、Better Auth内部で実際に使われているアクセスパターン

**Google限定の仕組みではない**: `internalAdapter.createAccount()`/`findAccounts()`は、OAuthコールバック処理(`callback.ts`、ルート`/callback/:id`)自体がGoogle専用ではなく全ソーシャルプロバイダー共通の処理であるため、`providerId`(例: `"google"`, `"github"`)と`accountId`(そのプロバイダー発行の安定したID)をaccountレコードに保存する仕組み自体はプロバイダー非依存。一方、案A(`mapProfileToUser`)は`socialProviders.<provider>.mapProfileToUser`のようにプロバイダーごとの個別設定であり、プロバイダーを追加するたびに同じロジックを複製する必要がある。この点でも案Cの方が設計として優れている。

**2026-08-21再検討で簡略化**: 当初案は「今回使われたプロバイダーを`ctx.params?.id`(未検証)で特定してから、そのproviderIdに一致するaccountレコードを探す」という2段階の設計だったが、`internalAdapter.findAccounts()`が返す各accountレコード自体に**`providerId`と`accountId`の両方が最初から含まれている**ため、`ctx.params?.id`は不要と判明した。stateless構成では`user`自体がそのリクエストで新規に作られたばかりで過去の紐付けを持たないため、`findAccounts(newSession.user.id)`が返すのは基本的に「今回のログインで使ったプロバイダーの1件」のみのはずである。これにより未検証事項が1つ減った(下記コード例は更新済み)。

```ts
// features/auth/lib/better-auth.ts（イメージ。Google専用ではなく、
// 有効な socialProviders 全てで動作することを意図した形）
hooks: {
  after: createAuthMiddleware(async (ctx) => {
    const newSession = ctx.context.newSession;
    if (!newSession) return; // セッションが実際に発行された時だけ実行 = ログイン完全成功のみ

    // stateless構成ではuser自体がこのリクエストで新規に作られたばかりで
    // 過去の紐付けを持たないため、返るのは基本的に今回ログインした1件のみ。
    // providerId/accountIdは各accountレコードに最初から含まれている
    const accounts = await ctx.context.internalAdapter.findAccounts(newSession.user.id);
    const linkedAccount = accounts[0];
    if (!linkedAccount) return;

    await createOrGetAccountCommand({
      email: newSession.user.email,
      name: newSession.user.name || newSession.user.email,
      provider: linkedAccount.providerId,
      providerAccountId: linkedAccount.accountId, // ← プロバイダーが発行する安定したID(Googleならsub)
      thumbnail: newSession.user.image || undefined,
    });
  }),
},
```

**案Bとの違い**

| | 案B(account_data Cookie) | 案C(internalAdapter、この案) |
| --- | --- | --- |
| データの取得元 | 署名付きCookie(リクエストをまたいで運ぶためのもの) | 同一リクエスト内のメモリ上のアダプタ |
| リクエストをまたぐ処理 | 必要(Cookieに保存→別リクエストで読み出す) | 不要(同一リクエスト内で書いて読むだけ) |
| 不確実性 | Cookie読み書きAPI(`accountInfo`/`useAccountCookie`)の正確な使い方が未確認。関連バグIssue #6770あり | `internalAdapter`/`findAccounts`が公開APIとして安定しているかは要検証だが、仕組み自体はシンプルで理解しやすい |

**懸念点**

- `ctx.context.internalAdapter`はBetter Authの**内部API(非公開・非ドキュメント化)**。将来のバージョンアップで変更・削除される可能性がある。ただしBetter Auth公式プラグイン自身が同じパターンで使っているため、少なくとも現バージョンでは安定して存在すると考えられる
- `hooks.after`の`ctx`から`ctx.context.internalAdapter`に実際にアクセスできるか(型定義上・実行時とも)は未検証。`createAuthMiddleware`のコールバックに渡される`ctx`の型を確認する必要がある
- `findAccounts`の戻り値の形(`providerId`/`accountId`などのフィールド名)も、上記コード例はユーザーの調査に基づく想定であり、実装時に実際の型・戻り値を確認すること(2026-08-21再検討で、この戻り値自体に`providerId`が含まれることを利用する形に簡略化し、`ctx.params?.id`は不要と判明。前述の懸念点から削除)
- 独自の`accounts`テーブルとの衝突: 衝突しない。`ctx.context.internalAdapter.findAccounts()`はBetter Auth自身の内部"account"概念(stateless構成ではメモリ上)を読むだけで、私たちの`accounts`テーブル(Postgres)への書き込みは今まで通り明示的に`createOrGetAccountCommand`を呼ぶ必要がある(値の取得元が変わるだけ)。詳細は上記「Account」という言葉が指す2つの別概念に注意(案Bの節)を参照。読み取りだけの操作なので、副作用として独自テーブルに影響することはない

**次に着手する際は、案A・案Bより先にこちら(案C)を検証すべき。**

## 2026-08-22追加調査: 案Cの実機検証結果とinternalAdapterの安定性

### 実機検証(`hooks.after`にデバッグログを追加して確認)

`features/auth/lib/better-auth.ts`の`hooks.after`に一時的なログ出力を追加し、`ctx.context.internalAdapter.findAccountByUserId(newSession.user.id)`(案Cと同じ`internalAdapter`を使う近縁のメソッド)で取得した`accountId`と、これまで`providerAccountId`として渡していた`newSession.user.id`を比較した。

- 同一プロセス内で複数回ログインしても、`internalAdapter`から取得した`accountId`は常に同じ値だった(Googleの`sub`として妥当)
- 一方`newSession.user.id`は、同一プロセス内では安定していたが、開発サーバーのプロセスを再起動(Ctrl+C→`pnpm dev`)すると別の値に変わった
- この結果は「案Cの背景」に記載した仮説(statelessの`internalAdapter`の実体はインメモリの`memoryAdapter`で、プロセスをまたぐと消える)と一致する。`user.id`が変わる根本原因は、プロセス再起動により`memoryDB`が空になり、`findUserByEmail`がヒットせず`createUser`が新しい`id`を生成するため(`db/internal-adapter.mjs`の`createUser`)

これにより、**案Cが取得しようとしている値(`internalAdapter`経由の`accountId`)がGoogleの安定した`sub`と一致すること**は実機で確認できた。

### internalAdapterの安定性についてのWeb調査

ユーザーからの指摘を受け、`ctx.context.internalAdapter`(および`findAccountByUserId`/`findAccounts`)の将来性についてWeb上のBetter Auth公式リポジトリ・ドキュメントを調査した。

- **GitHub Issue #9496「`internalAdapter` API cleanup」**: `internalAdapter`はBetter Auth公式ドキュメント(プラグイン開発ガイド)にも登場する、プラグイン作者向けの内部DB呼び出し用APIである。このIssueでは`findAccounts`と`findAccountByUserId`が「どちらも`userId`でfindManyする重複メソッド」として明記されており、命名の不整合や重複が公式に認識されている。ただし**非推奨(deprecated)を宣言する記述はなく**、具体的な統廃合の実施計画も本文にはない。ステータスは**Closed as not planned**(2026-08-22時点で再確認。検索キャッシュ上は一時的に「Open」と表示されたが、GitHubページの再取得により訂正)
- **GitHub Issue #8165「Unable to get account data from a plugin middleware/endpoint in stateless mode」**: stateless構成で`context.internalAdapter.findAccountByUserId`がリクエストによって`null`を返すなど不安定に動作する、という報告。PR #8181で対応されClose済み。この対応の結果として、Cookieからアカウント情報を安全に取得する`getAccountCookie`が公式に追加された(下記参照)
- **`google.ts`(Better Auth公式ソース、`packages/core/src/social-providers/google.ts`)**: `accountSubject: ({ profile }) => profile.sub`、`accountIssuer: "https://accounts.google.com"`と定義されていることを確認。Googleプロバイダーの`accountId`はOIDCの`sub`クレーム由来であることがソースレベルで裏付けられた
- **`better-auth/cookies`のpublic exports(このプロジェクトが実際にインストール済みのv1.7.1で確認)**: `node_modules`内の`dist/cookies/index.mjs`・`package.json`の`exports`マップを直接確認したところ、`getAccountCookie`/`setAccountCookie`は`better-auth/cookies`のサブパスから公式にexportされている(内部専用ファイルの奥に隠れているわけではない)。公式ドキュメント(`docs/concepts/oauth`)にも`authClient.accountInfo({ query: { useAccountCookie: true } })`という、DBなし構成でCookieからアカウント情報を取得する公開APIの使用例が掲載されている

### 結論(このプロジェクトでの位置づけ)

- `ctx.context.internalAdapter.findAccountByUserId`/`findAccounts`は、**現時点(Better Auth 1.7.1)で非推奨ではなく、Better Auth公式プラグインも同じアクセスパターンを使っている**。今すぐ動かなくなるリスクは低い
- ただし公式に「internal」と位置付けられたAPIであり、Issue #9496で重複が認識済みという事実は、**将来のメジャーバージョンで統廃合されうる**ことを示唆する。「5年・10年単位で保守する前提の恒久的な実装」として設計するべきAPIではない
- 一方で、`getAccountCookie`/`setAccountCookie`/`accountInfo({ useAccountCookie: true })`という、**Cookieベースの公開APIによる代替経路が現行バージョンで実際に存在する**ことも確認できた。これは案Bで懸念していた「Cookie読み書きAPIの正確な使い方が未確認」という点への手がかりになる
- 案Bで未解決だった「`hooks.after`(OAuthコールバックと同一リクエスト)の中で、直前に書き込んだはずの`account_data`Cookieを`getAccountCookie(ctx)`で読み返せるか」は、今回の調査でも**未検証のまま**。`setAccountCookie`は`ctx.setCookie`でレスポンス側にセットするだけで、同一リクエスト内の`ctx.getCookie`がその値を読み返せるかは別問題であり、これは実装時に別途確認が必要
- 以上より、**MVPを優先し短期的に案Cを採用すること自体は妥当**だが、`internalAdapter`への依存は呼び出し箇所を1か所に隔離すること、および長期的には「OAuthコールバック完了後の別リクエストで`auth.api.accountInfo({ query: { useAccountCookie: true } })`という公開APIから`accountId`を取得し、独自の`accounts`テーブルへ反映する」という設計への移行を将来の検討候補として残す

## 意思決定の記録

2026-08-21、ユーザーと合意: MVP実装を優先するため今回は着手せず、このファイルを計画として残し、後日着手する。同日、追加調査により案B(account_data Cookie機構の利用)を発見し、案Aより有力な候補として記録した。さらに同日、ユーザーが`node_modules`のBetter Authソースを直接調査し、案C(`ctx.context.internalAdapter.findAccounts()`で同一リクエスト内から読む)を発見。Cookieを介さずリクエストをまたぐ不確実性がないため、案Bより有力な最有力候補として記録した。

2026-08-22、`hooks.after`への一時的なデバッグログ追加により、案Cが取得する値(`internalAdapter`経由の`accountId`)がGoogleの`sub`と一致し、プロセスを再起動しても不変であることを実機確認した。また、これまで`providerAccountId`として使っていた`newSession.user.id`が、プロセス再起動によって変化することも実機で再現し、「案Cの背景」の仮説を裏付けた。あわせてユーザーの指摘を受け、`internalAdapter`の将来性についてWeb調査を実施(GitHub Issue #9496・#8165、Better Auth公式ソース・ドキュメントを確認)。結論は「2026-08-22追加調査」節に記載の通り、現時点では非推奨ではないが恒久採用向けではなく、着手する場合は依存箇所を1か所に隔離し、長期的には公開APIの`accountInfo({ useAccountCookie: true })`への移行を検討する、という方針を追記した。この調査時点でもMVP実装優先の方針は変えず、引き続き未着手のまま計画として残す。
