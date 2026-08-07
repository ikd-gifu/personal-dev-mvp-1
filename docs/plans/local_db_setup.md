# ローカルDB(PostgreSQL/Docker)運用メモ

このファイルは作業単位の一時的な引き継ぎ資料であり、`docs/global_design/`の設計書と同格には扱わない。作業完了後は削除してよい。

前提: 本番DBはNeon、本番アプリはGCP Cloud Runで稼働予定。ローカルはNext.js(frontend/)を非Docker化、DBのみDockerコンテナで起動する。

## 起動

```bash
docker compose up -d
docker compose ps   # STATUSが (healthy) になっていることを確認
```

## 停止

```bash
docker compose stop   # コンテナを停止のみ(ボリュームは保持)
```

## データを削除して完全に作り直す

```bash
docker compose down -v   # コンテナ削除 + ボリューム(postgres_data)も削除
docker compose up -d
```

`down -v`はデータを完全に消すため、意図しないデータ削除に注意。

## マイグレーション

```bash
cd frontend
npx drizzle-kit generate   # schema.ts の変更からマイグレーションSQLを生成(drizzle/配下)
npx drizzle-kit migrate    # ローカルDBへ適用(適用済みものは再実行してもスキップされる)
```

適用状況は`drizzle.__drizzle_migrations`テーブルで確認できる。

## テーブル構造の確認

```bash
docker compose exec db psql -U app_user -d personal_dev_mvp -c '\d accounts'
```

## 実施済み(2026-08-07時点)

- `accounts`テーブル実装・検証済み。`06_database_design.md`のカラム定義と一致することを確認済み。
- `templates`/`fields`テーブル実装・検証済み。`06_database_design.md`のカラム定義・制約(UNIQUE(template_id, order)、CHECK(order > 0)、fields→templatesのON DELETE CASCADE)と一致することを確認済み。
- id/createdAt(またはupdatedAt)はDBデフォルト値(`gen_random_uuid()`/`now()`)を採用(templatesも同様)。
- `schema.ts`に`templatesRelations`/`fieldsRelations`(drizzle `relations()`)を追加し、`db.query.templates.findFirst({ with: { fields: true, owner: true } })`のようなネスト取得(1クエリ)が動作することを確認済み。
- `notes`/`sections`テーブル実装・検証済み。`06_database_design.md`のカラム定義・制約(UNIQUE(note_id, field_id)、notes→templates/accountsはCASCADEなし、sections→notesはON DELETE CASCADE、sections→fieldsはCASCADEなし)・インデックス(notes: owner_id/template_id/updated_at DESC、sections: note_id/field_id)と一致することを確認済み。
  - id・created_at・updated_at・statusはDBデフォルト値(`gen_random_uuid()`/`now()`/`'Draft'`)を採用(`NoteRepository.newCreate()`がこれらを受け取らない設計のため)。section.idも同様にDBデフォルト値。
  - `sections.content`は`NOT NULL DEFAULT ''`(06に明記はないが、`Section`ドメインの`content: string`が常に文字列を要求するため)。
  - `schema.ts`に`notesRelations`(`sections: many`、`owner: one(accounts)`、`template: one(templates)`)/`sectionsRelations`(`note: one(notes)`、`field: one(fields)`)を追加し、`db.query.notes.findFirst({ with: { sections: true, owner: true, template: true } })`のネスト取得(1クエリ)が動作することをトランザクション内でテストデータを挿入→確認→ロールバックする形で検証済み(DBにテストデータは残していない)。
- 今回のセッションではテーブル+client配下のみ実装。Repository/Service/DTO/Handler(external層)は別セッションで着手(`docs/plans/external_implementation.md`参照)。
