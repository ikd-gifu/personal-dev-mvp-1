import type { DbClient } from "../../client/database";
import type { AccountRepository } from "../../domain/account/interface";
import type { NoteRepository } from "../../domain/note/interface";
import type { Field } from "../../domain/template/field";
import type { TemplateRepository } from "../../domain/template/interface";
import type { Template } from "../../domain/template/template";
import type { ITransactionManager } from "../../domain/transaction/transaction-manager.interface";
import { DrizzleAccountRepository } from "../../repository/account/account-repository";
import { DrizzleNoteRepository } from "../../repository/note/note-repository";
import type {
  TemplateDetail,
  TemplateDetailReader,
} from "../../repository/template/template-repository";
import { DrizzleTemplateRepository } from "../../repository/template/template-repository";
import { DrizzleTransactionManager } from "../../repository/transaction/drizzle-transaction-manager";

export interface TemplateDetailResult extends TemplateDetail {
  isUsed: boolean;
}

/**
 * TemplateService（アプリケーションサービス）
 *
 * ユースケース（業務フロー）の組み立てのみを担う。
 * DBアクセスの詳細はRepository、業務ルールはTemplate/Fieldエンティティに委ねる。
 *
 * コンストラクタは集約の読み書き（コマンド側: repository）と、owner結合済みの
 * 読み取りモデル（クエリ側: detailReader）を別引数で受け取る（CQRS分離を可視化するため）。
 * accountRepositoryは、create/edit後のレスポンス組み立てに必要なowner情報を
 * 取得するために注入する（Account集約の内部実装ではなく、そのRepositoryポートのみに依存）。
 * noteRepositoryは、isUsed判定（TemplateUsageCheck）のために注入する
 * （Note集約の内部実装ではなく、そのRepositoryポートのみに依存。accountRepositoryと同じ考え方）。
 * transactionManagerは、templates+fieldsという同一集約内の複数テーブル書き込み
 * （createTemplate/editTemplate）をひとつのトランザクションにまとめるために注入する
 * （frontend/docs/07_development_guide.md「トランザクション管理」）。
 */
export class TemplateService {
  constructor(
    private readonly repository: TemplateRepository<DbClient>,
    private readonly detailReader: TemplateDetailReader,
    private readonly accountRepository: AccountRepository,
    private readonly noteRepository: NoteRepository,
    private readonly transactionManager: ITransactionManager<DbClient>,
  ) {}

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート作成（POST /api/templates）
   *
   * ビジネスルール: 新規作成時のisUsedはfalse
   */
  async createTemplate(
    ownerId: string,
    input: {
      name: string;
      fields: { label: string; order: number; isRequired: boolean }[];
    },
  ): Promise<TemplateDetailResult> {
    const created = await this.transactionManager.execute((client) =>
      this.repository.newCreate(
        {
          name: input.name,
          ownerId,
          fields: input.fields,
        },
        client,
      ),
    );

    return this.withOwner(created, false);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート更新（PUT /api/templates/:id）
   *
   * ビジネスルール: 自分が所有するテンプレートのみ更新可能。
   * isUsed=true（使用中）の場合、フィールドの追加・削除・order変更は不可
   * （name・フィールドのlabel・isRequiredの変更は可）。判定（TemplateUsageCheck）は
   * Noteリポジトリへの問い合わせが必要なため、ドメイン層ではなくここで行う
   * （template.tsのJSDoc「利用中テンプレートの構造変更制限」参照）。
   *
   * editはtemplateIdを変えないため、使用中かどうかはedit前後で変わらない。
   * そのため1回のexistsByTemplateIdの結果を制限チェックとレスポンスの両方に使い回す。
   */
  async editTemplate(
    id: string,
    input: {
      name: string;
      fields: {
        id?: string;
        label: string;
        order: number;
        isRequired: boolean;
      }[];
    },
    accountId: string,
  ): Promise<TemplateDetailResult> {
    const template = await this.repository.findById(id);
    if (!template) {
      throw new Error("Template not found");
    }
    if (!template.isOwnedBy(accountId)) {
      throw new Error("This account does not own the template");
    }

    const isUsed = await this.noteRepository.existsByTemplateId(id);
    if (isUsed) {
      this.assertFieldStructureUnchanged(template.fields, input.fields);
    }

    // 新規fieldのidはここ（Service）で採番し、Template.edit()へ渡す（template.tsのJSDocどおり）。
    const fields = input.fields.map((field) => ({
      id: field.id ?? crypto.randomUUID(),
      label: field.label,
      order: field.order,
      isRequired: field.isRequired,
    }));

    const edited = template.edit({ name: input.name, fields }, new Date());
    await this.transactionManager.execute((client) =>
      this.repository.save(edited, client),
    );

    return this.withOwner(edited, isUsed);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート削除（DELETE /api/templates/:id）
   *
   * ビジネスルール: 所有者のみ削除可能。ノートで使用中（isUsed = true）のものは削除不可
   * （05_domain_design.md「利用中のテンプレートは削除できない」。判定はNoteチームへの
   * 問い合わせが必要なため、ドメイン層ではなくアプリケーションサービスで行う）。
   */
  async deleteTemplate(id: string, accountId: string): Promise<void> {
    const template = await this.repository.findById(id);
    if (!template) {
      throw new Error("Template not found");
    }
    if (!template.isOwnedBy(accountId)) {
      throw new Error("This account does not own the template");
    }

    const isUsed = await this.noteRepository.existsByTemplateId(id);
    if (isUsed) {
      throw new Error("Template is in use");
    }

    await this.repository.delete(id);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート詳細取得（GET /api/templates/:id）
   *
   * isUsedはexistsByTemplateIdの実値を返す（単体取得は元々1件のため、
   * バッチ判定によるN+1対策は不要）。
   */
  async getTemplateDetailById(
    id: string,
  ): Promise<TemplateDetailResult | null> {
    const detail = await this.detailReader.findDetailById(id);
    if (!detail) {
      return null;
    }

    const isUsed = await this.noteRepository.existsByTemplateId(id);
    return { ...detail, isUsed };
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート一覧取得（GET /api/templates）
   *
   * isUsedはexistsByTemplateIdsで一括判定した実値を返す（1件ずつexistsByTemplateIdを
   * 呼ぶN+1を避けるため、一覧のtemplateId群をまとめて1クエリで判定する）。
   */
  async listTemplateDetails(params: {
    ownerId?: string;
    q?: string;
  }): Promise<TemplateDetailResult[]> {
    const details = await this.detailReader.findManyDetail(params);
    const templateIds = details.map((detail) => detail.template.id);
    const usedTemplateIds =
      await this.noteRepository.existsByTemplateIds(templateIds);

    return details.map((detail) => ({
      ...detail,
      isUsed: usedTemplateIds.has(detail.template.id),
    }));
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート更新（PUT /api/templates/:id）ビジネスルール（isUsed=true時）
   *
   * - フィールドの追加: 不可（idを持たない＝新規、または既存テンプレートのfield.idに
   *   存在しないidが渡された場合）
   * - フィールドの削除: 不可（既存field.idのいずれかがinput側に含まれない場合）
   * - フィールドのorder変更: 不可（同じidのfieldでorderが一致しない場合）
   *
   * name・label・isRequiredの変更は制限しない（editTemplate側でそのまま反映される）。
   */
  private assertFieldStructureUnchanged(
    existingFields: Field[],
    inputFields: { id?: string; order: number }[],
  ): void {
    const existingIds = new Set(existingFields.map((field) => field.id));

    for (const field of inputFields) {
      if (field.id === undefined || !existingIds.has(field.id)) {
        throw new Error("Cannot add fields to a template that is in use");
      }
    }

    const inputIds = new Set(inputFields.map((field) => field.id as string));
    for (const existingId of existingIds) {
      if (!inputIds.has(existingId)) {
        throw new Error("Cannot remove fields from a template that is in use");
      }
    }

    const orderById = new Map(
      existingFields.map((field) => [field.id, field.order]),
    );
    for (const field of inputFields) {
      if (orderById.get(field.id as string) !== field.order) {
        throw new Error(
          "Cannot change field order on a template that is in use",
        );
      }
    }
  }

  private async withOwner(
    template: Template,
    isUsed: boolean,
  ): Promise<TemplateDetailResult> {
    const owner = await this.accountRepository.findById(template.ownerId);
    if (!owner) {
      throw new Error("Owner account not found");
    }

    return {
      template,
      owner: {
        id: owner.id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        thumbnail: owner.thumbnail,
      },
      isUsed,
    };
  }
}

export const templateService = new TemplateService(
  new DrizzleTemplateRepository(),
  new DrizzleTemplateRepository(),
  new DrizzleAccountRepository(),
  new DrizzleNoteRepository(),
  new DrizzleTransactionManager(),
);
