import type { DbClient } from "../../client/database";
import type { AccountRepository } from "../../domain/account/interface";
import type { NoteRepository } from "../../domain/note/interface";
import type { Note } from "../../domain/note/note";
import {
  canPublish,
  canUnpublish,
} from "../../domain/services/note-publication-policy";
import type { TemplateRepository } from "../../domain/template/interface";
import type { ITransactionManager } from "../../domain/transaction/transaction-manager.interface";
import { DrizzleAccountRepository } from "../../repository/account/account-repository";
import type {
  NoteDetail,
  NoteDetailReader,
} from "../../repository/note/note-repository";
import { DrizzleNoteRepository } from "../../repository/note/note-repository";
import { DrizzleTemplateRepository } from "../../repository/template/template-repository";
import { DrizzleTransactionManager } from "../../repository/transaction/drizzle-transaction-manager";

export type NoteDetailResult = NoteDetail;

/**
 * NoteService（アプリケーションサービス）
 *
 * ユースケース（業務フロー）の組み立てのみを担う。
 * DBアクセスの詳細はRepository、業務ルールはNote/Sectionエンティティに委ねる。
 *
 * コンストラクタは集約の読み書き（コマンド側: repository）、owner/field結合済みの
 * 読み取りモデル（クエリ側: detailReader）に加え、accountRepository（owner解決用）・
 * templateRepository（sections検証・fieldLabel解決用）を受け取る。
 * transactionManagerは、notes+sectionsという同一集約内の複数テーブル書き込み
 * （createNote/editNote）をひとつのトランザクションにまとめるために注入する
 * （frontend/docs/07_development_guide.md「トランザクション管理」）。
 */
export class NoteService {
  constructor(
    private readonly repository: NoteRepository<DbClient>,
    private readonly detailReader: NoteDetailReader,
    private readonly accountRepository: AccountRepository,
    private readonly templateRepository: TemplateRepository,
    private readonly transactionManager: ITransactionManager<DbClient>,
  ) {}

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」
   * ノート作成（POST /api/notes）
   *
   * ビジネスルール: 新規作成時のステータスは"Draft"。指定されたテンプレートが存在する
   * 必要がある。sectionsが未指定の場合、テンプレートのフィールドから空のセクションを自動生成。
   *
   * sectionsのfieldIdはtemplate.fieldsのfieldIdと過不足なく一致するかをここ（Service層）で
   * 厳密に検証する（Note単体では別集約であるTemplateの実体を参照できないため）。
   */
  async createNote(
    ownerId: string,
    input: {
      title: string;
      templateId: string;
      sections?: { fieldId: string; content: string }[];
    },
  ): Promise<NoteDetailResult> {
    const template = await this.templateRepository.findById(input.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    const sections = input.sections
      ? validateSections(input.sections, template.fields)
      : template.fields.map((field) => ({ fieldId: field.id, content: "" }));

    const note = await this.transactionManager.execute((client) =>
      this.repository.newCreate(
        {
          title: input.title,
          ownerId,
          templateId: input.templateId,
          sections,
        },
        client,
      ),
    );

    return this.buildDetail(note);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」
   * ノート更新（PUT /api/notes/:id）
   *
   * ビジネスルール: ノートの所有者のみ更新可能。テンプレートのフィールド構造は変更不可
   * （templateIdはNote.edit()に渡さない。3-4）。
   */
  async editNote(
    id: string,
    input: {
      title: string;
      sections: { id: string; content: string }[];
    },
    accountId: string,
  ): Promise<NoteDetailResult> {
    const note = await this.repository.findById(id);
    if (!note) {
      throw new Error("Note not found");
    }
    if (!note.isOwnedBy(accountId)) {
      throw new Error("This account does not own the note");
    }

    const edited = note.edit(
      { title: input.title, sections: input.sections },
      new Date(),
    );
    await this.transactionManager.execute((client) =>
      this.repository.save(edited, client),
    );

    return this.buildDetail(edited);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」
   * ノート削除（DELETE /api/notes/:id）
   *
   * ビジネスルール: ノートの所有者のみ削除可能。紐づくセクションも同時に削除される。
   */
  async deleteNote(id: string, accountId: string): Promise<void> {
    const note = await this.repository.findById(id);
    if (!note) {
      throw new Error("Note not found");
    }
    if (!note.isOwnedBy(accountId)) {
      throw new Error("This account does not own the note");
    }

    await this.repository.delete(id);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」
   * ノート公開（POST /api/notes/:id/publish）
   *
   * ビジネスルール: 本人のノートのみ公開可能。下書きから公開済みに状態遷移。
   * 既に公開済みの場合はエラー（Note.publish()内で判定）。
   */
  async publishNote(id: string, accountId: string): Promise<NoteDetailResult> {
    const note = await this.repository.findById(id);
    if (!note) {
      throw new Error("Note not found");
    }

    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (!canPublish(note, account)) {
      throw new Error("This account does not own the note");
    }

    const published = note.publish(new Date());
    await this.transactionManager.execute((client) =>
      this.repository.save(published, client),
    );

    return this.buildDetail(published);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」
   * ノート非公開（POST /api/notes/:id/unpublish）
   *
   * ビジネスルール: ノートの所有者のみ許可。公開から非公開に状態遷移。
   * 既に下書きの場合はエラー（Note.unpublish()内で判定）。
   */
  async unpublishNote(
    id: string,
    accountId: string,
  ): Promise<NoteDetailResult> {
    const note = await this.repository.findById(id);
    if (!note) {
      throw new Error("Note not found");
    }

    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (!canUnpublish(note, account)) {
      throw new Error("This account does not own the note");
    }

    const unpublished = note.unpublish(new Date());
    await this.transactionManager.execute((client) =>
      this.repository.save(unpublished, client),
    );

    return this.buildDetail(unpublished);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」
   * ノート詳細取得（GET /api/notes/:id）
   *
   * ビジネスルール: 見つからない場合、nullを返す。閲覧権限がない場合（非公開かつ本人でない）
   * も同様にnullを返す（非公開ノートの存在自体を第三者に漏らさないため）。
   */
  async getNoteDetailById(
    id: string,
    viewerId: string,
  ): Promise<NoteDetailResult | null> {
    const detail = await this.detailReader.findDetailById(id);
    if (!detail) {
      return null;
    }

    return detail.note.canBeViewedBy(viewerId) ? detail : null;
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」
   * ノート一覧取得（GET /api/notes）
   *
   * ビジネスルール: 公開済みあるいは自分のノートのみ取得（絞り込みはRepository層のWHERE句）。
   */
  async listNoteDetails(params: {
    viewerId: string;
    q?: string;
    status?: "Draft" | "Publish";
    templateId?: string;
    ownerId?: string;
  }): Promise<NoteDetailResult[]> {
    return this.detailReader.findManyDetail(params);
  }

  /**
   * 書込み後のレスポンス組み立て（Option2: Service内手動組み立て）。
   *
   * ドメインのSectionはfieldLabel/isRequiredを持たないため、templateRepository.findById()で
   * 取得したTemplate.fieldsをMap化し、書込み結果のnote.sections（DB再取得しないメモリ上の値）に
   * マージする。detailReader.findDetailById()による再取得は行わない（getNoteDetailById専用）。
   */
  private async buildDetail(note: Note): Promise<NoteDetailResult> {
    const template = await this.templateRepository.findById(note.templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    const owner = await this.accountRepository.findById(note.ownerId);
    if (!owner) {
      throw new Error("Owner account not found");
    }

    const fieldById = new Map(
      template.fields.map((field) => [field.id, field]),
    );

    return {
      note,
      owner: {
        id: owner.id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        thumbnail: owner.thumbnail,
      },
      sections: note.sections.map((section) => {
        const field = fieldById.get(section.fieldId);
        if (!field) {
          throw new Error(`Field not found: ${section.fieldId}`);
        }

        return {
          id: section.id,
          fieldId: section.fieldId,
          fieldLabel: field.label,
          content: section.content,
          isRequired: field.isRequired,
        };
      }),
    };
  }
}

/**
 * sectionsのfieldId集合がtemplate.fieldsのfieldId集合と過不足なく一致するかを検証する。
 */
function validateSections(
  inputSections: { fieldId: string; content: string }[],
  templateFields: { id: string }[],
): { fieldId: string; content: string }[] {
  const templateFieldIds = new Set(templateFields.map((field) => field.id));
  const inputFieldIds = new Set(
    inputSections.map((section) => section.fieldId),
  );

  const isExactMatch =
    inputFieldIds.size === inputSections.length &&
    inputFieldIds.size === templateFieldIds.size &&
    [...inputFieldIds].every((fieldId) => templateFieldIds.has(fieldId));

  if (!isExactMatch) {
    throw new Error(
      "sections.fieldId must exactly match the template's field ids",
    );
  }

  return inputSections;
}

export const noteService = new NoteService(
  new DrizzleNoteRepository(),
  new DrizzleNoteRepository(),
  new DrizzleAccountRepository(),
  new DrizzleTemplateRepository(),
  new DrizzleTransactionManager(),
);
