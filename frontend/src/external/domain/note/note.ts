import { Status } from "../shared/value-objects";
import { Section } from "./section";

/**
 * Note（エンティティ／Noteチーム集約ルート）
 *
 * 用語定義: docs/global_design/03_ubiquitous_language.md「ノート（Note）関連」
 * 属性定義: docs/global_design/05_domain_design.md「エンティティ」
 * 集約定義: docs/global_design/05_domain_design.md「集約」Noteチーム
 *
 * Templateを元に作成する設計メモ1件。Accountに属する。
 */
export class Note {
  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Noteチーム（ノートの世界）」
   *
   * ルール:
   * - titleは空NG
   * - section.fieldIdは重複NG（DB側のUNIQUE(note_id, field_id)に対応。
   *   docs/global_design/06_database_design.md「sections」参照）
   *
   * `new Note(...)`を呼べるのはこのファイル内のみ（コンストラクタがprivate）なので、
   * 生成経路が増えてもここでの検証から漏れることはない。
   *
   * 注記: sections（各section.fieldId）がtemplateのfieldsと過不足なく一致するかは、
   * Note単体（このコンストラクタ）では判定できない（Templateという別集約の実体が必要）
   * ため、ここでは検証しない（Account/Templateと同様、単一集約内で判定できない制約は
   * ドメイン層で検証しない方針）。
   */
  private constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly ownerId: string,
    public readonly templateId: string,
    public readonly sections: Section[],
    public readonly status: Status,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {
    if (!title.trim()) {
      throw new Error("Note must have a title");
    }

    const fieldIds = sections.map((section) => section.fieldId);
    if (new Set(fieldIds).size !== fieldIds.length) {
      throw new Error("Section fieldId must not be duplicated");
    }
  }

  static create(params: {
    id: string;
    title: string;
    ownerId: string;
    templateId: string;
    sections: {
      id: string;
      fieldId: string;
      content: string;
    }[];
    status: "Draft" | "Publish";
    createdAt: Date;
    updatedAt: Date;
  }): Note {
    const title = params.title.trim();
    const sections = params.sections.map(
      (section) => new Section(section.id, section.fieldId, section.content),
    );

    return new Note(
      params.id,
      title,
      params.ownerId,
      params.templateId,
      sections,
      Status.create(params.status),
      params.createdAt,
      params.updatedAt,
    );
  }

  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Noteチーム（ノートの世界）」
   *
   * ルール: Note作成時に指定したTemplateは後から変更できない
   *
   * title・sectionsのcontentのみ変更可能（templateIdは受け取らない）。
   * sectionはid指定で既存のsectionと突き合わせ、fieldIdは既存の値を引き継ぐ
   * （templateIdが不変のため、section.fieldIdの構成も変わらない）。
   */
  edit(
    params: {
      title: string;
      sections: {
        id: string;
        content: string;
      }[];
    },
    now: Date,
  ): Note {
    const title = params.title.trim();
    const sections = params.sections.map((section) => {
      const current = this.sections.find((s) => s.id === section.id);
      if (!current) {
        throw new Error(`Section not found: ${section.id}`);
      }

      return new Section(current.id, current.fieldId, section.content);
    });

    return new Note(
      this.id,
      title,
      this.ownerId,
      this.templateId,
      sections,
      this.status,
      this.createdAt,
      now,
    );
  }

  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Noteチーム（ノートの世界）」
   *
   * ルール: ステータスは「下書き」か「公開」だけ
   *
   * Draft→Publishの状態遷移のみ許可する。オーナー判定（権限チェック）は
   * services/note-publication-policy.ts の canPublish で行う。
   */
  publish(now: Date): Note {
    if (this.status.isPublish()) {
      throw new Error("Note is already published");
    }

    return new Note(
      this.id,
      this.title,
      this.ownerId,
      this.templateId,
      this.sections,
      Status.create("Publish"),
      this.createdAt,
      now,
    );
  }

  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Noteチーム（ノートの世界）」
   *
   * Publish→Draftの状態遷移のみ許可する。オーナー判定（権限チェック）は
   * services/note-publication-policy.ts の canUnpublish で行う。
   */
  unpublish(now: Date): Note {
    if (this.status.isDraft()) {
      throw new Error("Note is already a draft");
    }

    return new Note(
      this.id,
      this.title,
      this.ownerId,
      this.templateId,
      this.sections,
      Status.create("Draft"),
      this.createdAt,
      now,
    );
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」ビジネスルール
   * 「公開済み（Publish）あるいは自分のノートは下書きも取得」
   */
  canBeViewedBy(viewerId: string): boolean {
    return this.status.isPublish() || this.ownerId === viewerId;
  }

  /**
   * ステータス変更・更新・削除の権限チェック（オーナー判定）に使う。
   * docs/global_design/05_domain_design.md「ドメインサービス」canPublish/canUnpublishから利用する。
   */
  isOwnedBy(accountId: string): boolean {
    return this.ownerId === accountId;
  }
}
