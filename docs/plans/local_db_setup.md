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

## 実施済み(2026-07-28時点)

- `accounts`テーブルのみ実装・検証済み。`06_database_design.md`のカラム定義と一致することを確認済み。
- id/createdAt/updatedAt/isActiveはDBデフォルト値(`gen_random_uuid()`/`now()`/`true`)を採用。
- 他テーブル(templates/fields/notes/sections)は未着手。
