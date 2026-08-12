# 技術スタック

## コア技術

| カテゴリ  | 技術       | バージョン/備考   |
| --------- | ---------- | ------------------ |
| Framework | Next.js    | 16+ (App Router)   |
| 言語      | TypeScript | 5.x                |
| UI        | React      | 19                 |

## 主要ライブラリ

| 用途               | ライブラリ            | 状態     | 理由                                    |
| ------------------ | --------------------- | -------- | ---------------------------------------- |
| スタイリング       | Tailwind CSS           | 導入済み | ユーティリティファースト CSS。shadcn/uiの利用に必須 |
| UI コンポーネント  | shadcn/ui              | 導入予定 | カスタマイズ可能なコンポーネント         |
| 状態管理           | TanStack Query         | 導入予定 | サーバー状態の管理に特化                 |
| フォーム           | React Hook Form + Zod  | 導入予定 | 型安全なフォーム処理                     |
| バリデーション     | Zod                    | 導入済み | 型安全なスキーマ検証                     |
| 認証               | Better Auth            | 導入予定 | Stateless + カスタムセッション           |
| ORM                | Drizzle                | 導入済み | 型安全な SQL                             |
| コード品質         | Biome                  | 導入済み | 高速なリンター/フォーマッター            |

「導入予定」は`docs/global_design/`の要件および現行コード内のコメント(例: [session.server.ts](../src/features/auth/servers/session.server.ts))から見込まれる採用技術であり、現時点の`package.json`にはまだ含まれない。実装フェーズが進み次第このドキュメントを更新する。

## インフラストラクチャ

| 環境             | サービス           | 詳細                             |
| ---------------- | ------------------ | -------------------------------- |
| 本番 DB          | Neon               | PostgreSQL 互換のサーバーレス DB |
| 開発 DB          | Docker Compose     | PostgreSQL 17                    |
| ホスティング     | Google Cloud Run   | Cloud Build による自動デプロイ   |
| CI/CD            | GitHub Actions     |                                   |
| 監視             | Cloud Logging      | 最低限の監視のみ(MVP)            |
| 認証プロバイダー | Google OAuth       | ソーシャルログインのみ           |

## 開発環境要件

- Node.js 24.x 以上
- pnpm 10.x 以上
- Docker Desktop (開発 DB 用)
