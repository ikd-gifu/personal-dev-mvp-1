# syntax=docker.io/docker/dockerfile:1

ARG NODE_VERSION=24.14.0-slim
FROM node:${NODE_VERSION} AS base

# --- deps: 依存関係のみインストール(レイヤーキャッシュを効かせるため) ---
FROM base AS deps
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- builder: アプリをビルド ---
FROM base AS builder
WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next build はモジュール解析のため database/index.ts を評価し、
# DATABASE_URL 未設定だと throw する(実際には接続しないためダミー値でよい)。
# 本番の接続情報は実行時に docker run -e / Cloud Run の環境変数として渡す。
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NODE_ENV=production

RUN pnpm build

# --- runner: 実行専用の最小イメージ ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=8080

# unstable_cache等が.next/cacheへ書き込めるよう、事前にディレクトリを用意し所有者をnodeユーザーにする
RUN mkdir .next
RUN chown node:node .next

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 8080

CMD ["node", "server.js"]
