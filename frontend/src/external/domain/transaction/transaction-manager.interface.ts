/**
 * ITransactionManager（ポート）
 *
 * 設計方針: frontend/docs/07_development_guide.md「トランザクション管理」
 * トランザクション境界: docs/global_design/06_database_design.md「集約とトランザクション境界」
 * （集約＝トランザクション境界。Template+Fields、Note+Sectionsのような
 * 同一集約内の複数テーブル書き込みをひとつのトランザクションにまとめるために使う）
 *
 * 実装（アダプタ）は external/repository 配下に置く。
 * このファイルは external/domain の一部であり、他レイヤー（Drizzle等のinfra）に
 * 依存しない。TClientをジェネリクスにすることで、具体的なクライアント型
 * （DbClient）を持ち込まずに済ませている。
 */
export interface ITransactionManager<TClient> {
  execute<T>(callback: (client: TClient) => Promise<T>): Promise<T>;
}
