import { Field } from "./field";

/**
 * Template（エンティティ／Templateチーム集約ルート）
 *
 * 用語定義: docs/global_design/03_ubiquitous_language.md「テンプレート（Template）関連」
 * 属性定義: docs/global_design/05_domain_design.md「エンティティ」
 * 集約定義: docs/global_design/05_domain_design.md「集約」Templateチーム
 *
 * 複数の項目（Field）を持ち、Noteの元になるテンプレート。Accountに属する。
 */
export class Template {
  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Templateチーム（テンプレートの世界）」
   *
   * ルール:
   * - nameは空NG
   * - field.order（1始まり）は重複NG
   *
   * `new Template(...)`を呼べるのはこのファイル内のみ（コンストラクタがprivate）なので、
   * 生成経路が増えてもここでの検証から漏れることはない。
   *
   * 注記: field.labelの非空・field.orderの下限（1始まり）はField単体で判定できる制約のため、
   * Field自身のコンストラクタ（field.ts）で検証する。ここではFieldどうしの関係でしか
   * 判定できないorder重複のみを検証する。
   *
   * 注記: Fieldは単体のファクトリ（create）を持たない。Templateがtrim済みの値で
   * `new Field(...)`する（子は親を通してしか触れない）。
   *
   * 注記: 「利用中テンプレートの構造変更制限」は、Noteリポジトリへの問い合わせが
   * 必要な判定のため、ここでは検証せずアプリケーションサービス層の責務とする。
   */
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly ownerId: string,
    public readonly fields: Field[],
    public readonly updatedAt: Date,
  ) {
    if (!name.trim()) {
      throw new Error("Template must have a name");
    }

    const orders = fields.map((field) => field.order);
    if (new Set(orders).size !== orders.length) {
      throw new Error("Field order must not be duplicated");
    }
  }

  static create(params: {
    id: string;
    name: string;
    ownerId: string;
    fields: {
      id: string;
      label: string;
      order: number;
      isRequired: boolean;
    }[];
    updatedAt: Date;
  }): Template {
    const name = params.name.trim();
    const fields = params.fields.map(
      (field) =>
        new Field(field.id, field.label.trim(), field.order, field.isRequired),
    );

    return new Template(
      params.id,
      name,
      params.ownerId,
      fields,
      params.updatedAt,
    );
  }

  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Templateチーム（テンプレートの世界）」
   *
   * ルール: Fieldの追加・削除・並べ替えはテンプレートがまとめて行う
   *
   * name・fields一式を渡して置き換える（差分更新ではない）。
   * 新規追加するfieldのidは呼び出し側（アプリケーションサービス／Repository）で
   * 採番済みであること（3-7: ドメインのcreateはidを必須パラメータとして受け取るのみ）。
   */
  edit(
    params: {
      name: string;
      fields: {
        id: string;
        label: string;
        order: number;
        isRequired: boolean;
      }[];
    },
    now: Date,
  ): Template {
    const name = params.name.trim();
    const fields = params.fields.map(
      (field) =>
        new Field(field.id, field.label.trim(), field.order, field.isRequired),
    );

    return new Template(this.id, name, this.ownerId, fields, now);
  }

  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Templateチーム（テンプレートの世界）」
   *
   * 「利用中テンプレートの構造変更制限」の前段として、所有者判定のみをここで行う。
   * 使用中かどうかの判定（TemplateUsageCheck）はNoteリポジトリへの問い合わせが
   * 必要なため、アプリケーションサービス層の責務とする。
   */
  isOwnedBy(accountId: string): boolean {
    return this.ownerId === accountId;
  }
}
