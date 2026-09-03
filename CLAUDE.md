# プロジェクト構成

- `docs/global_design/` …… システム設計書一式(要件、ユースケース、ユビキタス言語、ドメイン設計、DB設計、API設計)
- `docs/plans/` …… 実装計画・引き継ぎメモ(作業単位の一時文書)
- `frontend/docs/` …… external層(domain以外。handler・service・client・dto・repository)の実装方針(恒久文書。未作成、Account/Template/Noteの実装を踏まえて作成予定)
- `frontend/` …… Next.jsアプリケーション本体

## 情報の優先順位

作業内容を判断する際は、以下の優先順位で参照すること。

1. **`docs/global_design/`** …… 何を実装するかの正(仕様・命名・業務ルール)
2. **`docs/plans/`** …… 設計書間の矛盾に対する合意済みの解決方針(設計書を補足する。設計書そのものより優先度は低い)
3. **`frontend/docs/`** …… external層(domain以外)のどう書くかの正(実装方針が存在する場合、この範囲では`account`実装のコーディングパターンより優先する)
4. **`src/external/domain/account`** …… ドメイン層のどう書くかの参照実装(コーディングパターン・書式)

コーディングパターンは`account`実装に合わせるが、**`account`の実装内容が設計書と食い違う場合は設計書を優先し、`account`側の逸脱の可能性としてユーザーに報告すること**。`frontend/docs/`が対象とするのはdomain層以外(handler/service/client/dto/repository)であり、domain層のコーディングパターンは引き続き`account`実装を参照する。

## ドキュメント規約

- `docs/global_design/`はシステム設計の正。読み取り専用として扱い、指示なく追記・変更しない
- `docs/plans/`は実装計画・引き継ぎメモ。作業単位で作成する一時文書であり、設計書と同格には扱わない。作業完了後は削除してよい
- `frontend/docs/`はexternal層(domain以外)の実装方針。`docs/global_design/`と同様に恒久的な文書として扱い、作成後は指示なく変更しない

## アーキテクチャ規約

- `external/domain`は純粋なドメインロジックのみを置く。他レイヤー(infra、UI、Next.js APIルートなど)への依存を禁止する
- 命名は`03_ubiquitous_language.md`の用語に厳密に従う。存在しない用語を新規導入する場合は勝手に決めず確認を取る
- DTOとドメインモデルは別物として扱う。`07_api_design.md`のリクエスト/レスポンス形状にドメインモデルを合わせない
- 値オブジェクト・エンティティは不変。不正値は例外(`throw new Error(...)`)で表現する(Result型のようなライブラリ的な仕組みは導入しない)

## Account実装で確立したパターンのうち、コードから読み取れない判断基準

- **`create`(static factory)と`newCreate`(Repository)の役割分担**: `Account.create()`はコンストラクタと同様「完全な状態から妥当なインスタンスを組み立てる」ための汎用ファクトリで、新規登録・ログイン更新後・永続化データからの再構築のすべてに使う(create/update/reconstructを区別しない)。一方`AccountRepository.newCreate()`は「OAuthから得られる生の値だけを受け取り、id・createdAt・updatedAtの採番はDB/Repository側に委ねる」という、外部境界からの新規登録専用のエントリーポイント。両者は名前が似ているが目的が異なるため、Template/Noteでも同様の使い分けが必要かを都度検討すること。
- **不変条件チェックをコンストラクタに一本化する理由**: コンストラクタは`private`にし、検証(例: firstName・lastNameのどちらかは必須)をコンストラクタ内に書く。生成経路(`create`/`updateOnLogin`など)が将来増えても、チェックを書き忘れて不正な状態のインスタンスが作られることがないようにするため。
- **trimを呼び出し側(`create`/`updateOnLogin`)で行う理由**: コンストラクタのパラメータプロパティ省略記法(`public readonly firstName: string`)は、代入前に値を変換できない制約がある。そのため、保存前の正規化(trim)は呼び出し側で行い、コンストラクタ内の不変条件チェックは(呼び出し側のtrim漏れに備えて)`.trim()`した上で判定する。
- **`updateOnLogin`が`email`を更新しない理由**: Googleアカウントのメールアドレスは理論上変更され得るが、`email`にはDBの`UNIQUE`制約があり、ログイン毎に同期すると衝突のリスクがある。そのためemailは登録時(`newCreate`)に固定し、ログイン時に同期するプロフィール情報は`firstName`/`lastName`/`thumbnail`のみとする。
- **`provider` + `providerAccountId`の一意性をドメインで検証しない理由**: 単一の集約(Accountインスタンス)からは他アカウントの存在を確認できないため、検証はDBの`UNIQUE`制約に委ねる。

## Secrets Handling(重要・必ず遵守)

このマシン上のプロジェクトでは `.env*` ファイルや `secrets/` 配下に、DB接続文字列・APIキー・認証シークレットなどの機密情報が含まれる可能性があります。以下を厳守してください。

- `.env*` ファイルや `secrets/` 配下のファイルの中身を読む・表示する・catする・grepする・echoする・printenvするなど、いかなる方法でも値を会話やターミナル出力に出さない。
- 環境変数が設定されているかどうかを確認したい場合は、値ではなくキー名の有無だけを確認する。
  - 例: `grep -oE '^[A-Z_]+' .env.local`(値は表示しない)
  - 例: `node -e "console.log(!!process.env.DATABASE_URL)"`(真偽値のみ)
- 接続文字列・パスワード・APIキー・トークンなど機密性の高い値は、コード・コミットメッセージ・会話のどこにも出力しない。
- 万一、上記のような値を誤って出力してしまった場合は、直ちにその旨をユーザーに報告する。ユーザーは該当サービス側でのキー/パスワードのローテーション対応を行う。

### 設定後の確認手順

既存プロジェクトで確認

```bash
cd ~/Desktop/フリーランス学習/神速の技術習得術/personal-dev-mvp-1 && claude
```

「.envを読んで」「cat .env を実行して」を依頼し、両方ブロックされる(内容が一切出力されない)ことを確認。

未知の新規ディレクトリでも機能するか確認

```bash
mkdir -p ~/Desktop/test-new-project && cd ~/Desktop/test-new-project
echo "SECRET=123" > .env
claude
```

同様に「.envを読んで」を依頼し、読み取りがブロックされることを確認。

環境変数のunsetも確認

「env | grep DATABASE_URL を実行して」を依頼し、コマンド自体は実行されるが `DATABASE_URL` が出力に含まれないこと(シェルセッションに `.env*` の内容が読み込まれていないこと)を確認。

開発サーバー起動がブロックされることも確認

「pnpm dev で開発サーバーを起動して」を依頼し、`next dev` が `listen EPERM: operation not permitted 0.0.0.0:3000` で起動に失敗することを確認。

## Dev Server Handling

- `npm run dev` などの開発サーバー起動はClaude Codeから実行しない。sandboxの制限によりアプリ自身が `.env.local` や関連の環境変数を読めず、正しく動作しないため。
- 開発サーバーの起動・停止はユーザーが手動で別ターミナルから行う。Claude Codeはコードの実装・修正・確認(ビルド確認や型チェックなど、`.env*` を必要としない範囲のコマンド実行)に専念する。
