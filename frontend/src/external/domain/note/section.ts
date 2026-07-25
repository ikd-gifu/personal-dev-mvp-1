/**
 * Section（エンティティ／Noteチームの子エンティティ）
 *
 * 用語定義: docs/global_design/03_ubiquitous_language.md「ノート（Note）関連」
 * 属性定義: docs/global_design/05_domain_design.md「エンティティ」
 *
 * Noteの1つの記入欄。テンプレートのField（fieldId）に対応するcontentを持つ。
 *
 * 注記: docs/global_design/05_domain_design.md「エンティティ」表の注記の通り、
 * isRequired（必須）チェックはMVPではドメイン層で行わない。
 * そのためcontentの非空検証はここでは行わない（空文字許容）。
 *
 * 単体のファクトリ（create）は持たない。Sectionは常にNote経由（`new Section(...)`）
 * で生成する（子は親を通してしか触れない）。
 */
export class Section {
  constructor(
    public readonly id: string,
    public readonly fieldId: string,
    public readonly content: string,
  ) {}
}
