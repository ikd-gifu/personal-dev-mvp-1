import type { DbClient } from "../../client/database";
import { db } from "../../client/database";
import type { ITransactionManager } from "../../domain/transaction/transaction-manager.interface";

/**
 * DrizzleTransactionManager（アダプタ）
 *
 * ポート定義: frontend/src/external/domain/transaction/transaction-manager.interface.ts
 *
 * Drizzleのdb.transaction()をラップする。Service層はRepositoryの`newCreate`/`save`を
 * 直接呼ばず、このexecute()経由で呼ぶことで、集約内の複数テーブル書き込み
 * （Template+Fields、Note+Sections）をひとつのトランザクションにまとめる。
 */
export class DrizzleTransactionManager
  implements ITransactionManager<DbClient>
{
  async execute<T>(callback: (client: DbClient) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => callback(tx));
  }
}
