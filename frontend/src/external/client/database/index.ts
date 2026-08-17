import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
