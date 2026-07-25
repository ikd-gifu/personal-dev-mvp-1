import type { Account } from "../account/account";
import type { Note } from "../note/note";

/**
 * note-publication-policy（ドメインサービス）
 *
 * 定義: docs/global_design/05_domain_design.md「ドメインサービス」
 *
 * Account・Noteの2つの集約をまたぐ判定のため、Note集約内メソッド（isOwnedBy）
 * とは別に、独立したドメインサービス（純粋関数）として実装する。
 * ロード済みの集約だけを見て判定する（DBアクセスなし）。
 */

/**
 * ノートを「下書き→公開」にしてよいかを判定する。オーナーならOK、他人ならNG。
 */
export function canPublish(note: Note, account: Account): boolean {
  return note.isOwnedBy(account.id);
}

/**
 * ノートの公開を取り消せるかを判定する。オーナーならOK、他人ならNG。
 */
export function canUnpublish(note: Note, account: Account): boolean {
  return note.isOwnedBy(account.id);
}
