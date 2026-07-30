# External層実装計画(引き継ぎメモ)

このファイルは作業単位の一時的な引き継ぎ資料であり、`docs/global_design/`の設計書と同格には扱わない。作業完了後は削除してよい。

## 目的

`frontend/src/external`配下に、domain層以外(repository・service・handler・dto)を実装する。domain層(Account/Template/Note)とDB層(`external/client/database`、accountsテーブルのみ実装済み)は完了済み。

## 現状

- domain層: Account/Template/Note すべて実装済み(`frontend/src/external/domain/`)
- DB層: `accounts`テーブルのみ実装・動作確認済み(`frontend/src/external/client/database/`)。templates/fields/notes/sectionsは未着手
- external層(repository/service/handler/dto): 未着手

## 合意した進め方

1. **Accountのみ、external層を一通り実装する**
   - 実装順(ボトムアップ): Repository → Service → (dto定義) → Handler
   - 実行時のデータの流れ(呼び出し順)はこの逆: Handler → Service → Repository → DB
   - Repositoryは`frontend/src/external/domain/account/interface.ts`の`AccountRepository`を、Drizzle(`external/client/database`)で実装する
   - dtoの形は`docs/global_design/07_api_design.md`「Accounts（アカウント）API」に従う。DTOとドメインモデルは別物として扱う(CLAUDE.md「アーキテクチャ規約」)
2. **その後、Template・Noteのexternal層を実装する**(DBスキーマ(templates/fields/notes/sections)も合わせて作成)
   - Templateは子エンティティField、Noteは子エンティティSection＋Template参照＋viewerId付きクエリなど、Accountにはない複雑さがあるため、Repositoryパターンの再検討が必要になる可能性がある
3. **Account/Template/Noteの3つが揃った時点で、共通パターンを`frontend/docs/`に文書化する**(恒久的な設計方針。CLAUDE.mdの「情報の優先順位」に新設した第3階層)
   - 参考として、教材を使った先行実装リポジトリを参照してよい。
4. **文書化した方針に沿って、必要なら実装を整理し直す**

## 次のセッションでまず行うこと

Accountのexternal層実装(Repository → Service → dto → Handler)に着手する。
