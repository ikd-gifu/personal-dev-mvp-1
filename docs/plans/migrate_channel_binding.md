# マイグレーション時のchannel binding対応(見送り)

このファイルは作業単位の一時的な引き継ぎ資料であり、`docs/global_design/`の設計書と同格には扱わない。作業完了後は削除してよい。

**ステータス: 未着手。MVP実装を優先するため、2026-08-27時点では見送りと合意済み。着手する場合はこのファイルを計画として使う。**

## 背景

Neonの接続文字列には`channel_binding=require`というクエリパラメータが付与されている。これはSCRAM-SHA-256-PLUS(TLSチャネルにバインドした認証、通常のSCRAM-SHA-256より中間者攻撃に強い)を要求する意図のパラメータ。

しかし、`pg`(node-postgres)が使う`pg-connection-string`はこのパラメータを解釈しない(ソースコード上に該当キーワードなし)。SCRAM-SHA-256-PLUSを実際に使うには、`pg.Pool`/`pg.Client`のコンストラクタオプション`enableChannelBinding: true`をコード側で明示的に指定する必要がある(`pg@8.22.0`の`lib/client.js`で実装を確認済み)。指定しない場合は通常のSCRAM-SHA-256にフォールバックする(機能上は問題なく接続できる。あくまで追加のセキュリティ強化)。

- [database/index.ts](../../frontend/src/external/client/database/index.ts)(アプリのランタイム接続、`DATABASE_URL`＝pooled)には`enableChannelBinding: true`を適用済み(または適用予定)。
- 一方、`drizzle-kit migrate`(`db:migrate`スクリプト、`drizzle.config.ts`の`dbCredentials`、`DIRECT_URL`＝direct)は、`drizzle-kit`の型定義上`dbCredentials`に`url`/`host`等と`ssl`のみが定義されており、**`enableChannelBinding`に相当する設定項目が存在しない**(`drizzle-kit@0.31.10`の型定義で確認済み)。そのためマイグレーション実行時にはchannel bindingを効かせる手段が現状ない。

## 見送りの理由

- マイグレーションは開発者が手元またはCI/CDから手動・一時的に実行する操作であり、Cloud Run上で常時稼働し外部リクエストを継続的に捌くランタイム接続([database/index.ts](../../frontend/src/external/client/database/index.ts))とはリスクプロファイルが異なる。
- TLS証明書検証(`sslmode=require`)自体は既に有効なため、channel bindingは多層防御の追加strengtheningであり、必須要件ではない。
- MVP段階でこのために独自マイグレーションランナー(`migrate.ts`)を新設するのは、現状のタスクが求める以上の抽象化導入にあたると判断した。

## 着手する場合の方針

`drizzle-kit migrate`というCLIコマンドをやめ、`drizzle-orm/node-postgres/migrator`の`migrate()`関数と、`enableChannelBinding: true`を指定した自前の`pg.Pool`を組み合わせた`migrate.ts`スクリプトを新設する。`package.json`の`db:migrate`はこのスクリプト(例: `tsx scripts/migrate.ts`)を呼ぶ形に差し替える。
