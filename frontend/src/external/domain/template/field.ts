/**
 * Field（エンティティ／Templateチームの子エンティティ）
 *
 * 用語定義: docs/global_design/03_ubiquitous_language.md「テンプレート（Template）関連」
 * 属性定義: docs/global_design/05_domain_design.md「エンティティ」
 *
 * Templateの1つの入力項目。
 *
 * ルール定義: docs/global_design/05_domain_design.md
 * 「ドメインロジック」＞「Templateチーム（テンプレートの世界）」
 *
 * ルール:
 * - labelは空NG
 * - order（1始まり）は正の整数
 *
 * Field単体で判定できる制約はここで検証する。一方、order の重複禁止は
 * 他のFieldとの関係でしか判定できないため、集約ルートであるTemplateの
 * コンストラクタで検証する。
 *
 * 単体のファクトリ（create）は持たない。Fieldは常にTemplate経由（`new Field(...)`）
 * で生成する（子は親を通してしか触れない）。保存前の正規化（trim）は
 * 呼び出し側であるTemplateの`create`/`edit`で行う。
 */
export class Field {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly order: number,
    public readonly isRequired: boolean,
  ) {
    if (!label.trim()) {
      throw new Error("Field label must not be empty");
    }
    if (order <= 0) {
      throw new Error("Field order must start from 1");
    }
  }
}
