import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * `enableChannelBinding`はpg本体(lib/client.js)には実装済みだが、
 * `@types/pg`の型定義が追従していないため、intersection型で明示的に拡張する。
 */
const poolConfig: PoolConfig & { enableChannelBinding: boolean } = {
  connectionString: process.env.DATABASE_URL,
  enableChannelBinding: true,
};

/**
 * developmentのみ`pool`をglobalThisにキャッシュする理由: `next dev`のHMRでこのモジュールが
 * 再評価されるたびに`new Pool()`が呼ばれ、古い接続を閉じないまま新しい接続を張り続けて
 * リークするのを防ぐため。Cloud Run（`next start`）はモジュールが起動時に一度しか評価されず
 * 無関係なので、production側に不要なグローバル可変状態を持ち込まないようdevelopmentに限定する。
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? new Pool(poolConfig);

if (process.env.NODE_ENV === "development") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });

/**
 * DbTransaction（db.transaction()のコールバックが受け取るtxの型）
 *
 * PgTransaction等のDrizzle内部型を直接importせず、db.transaction()の型から
 * Parametersで抽出する（Drizzleのバージョンが上がってtxの型階層が変わっても、
 * ここが自動的に追従する）。
 */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * DbClient（Drizzleクライアントの型）
 *
 * external/repository配下のRepository実装が`client: DbClient = db`という形で
 * 受け取る引数の型。トランザクション時はService層からdb.transaction()のtxがここに渡る
 * （frontend/docs/07_development_guide.md「トランザクション管理」参照）。
 *
 * `db`とtxの共通の基底型（構造的に両方が代入可能な型）ではなく、明示的な
 * union（`typeof db | DbTransaction`）にしている理由: 基底型に頼ると、
 * Drizzleの型階層が変わった際に代入可能性が崩れても気づきにくい。
 * unionなら「dbそのもの、または進行中のtx」という意図がそのまま型に表れる。
 */
export type DbClient = typeof db | DbTransaction;
