import type { AccountRepository } from "../../domain/account/interface";
import { Template } from "../../domain/template/template";
import type { TemplateRepository } from "../../domain/template/interface";
import { DrizzleAccountRepository } from "../../repository/account/account-repository";
import type {
  TemplateDetail,
  TemplateDetailReader,
} from "../../repository/template/template-repository";
import { DrizzleTemplateRepository } from "../../repository/template/template-repository";

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
 */
export class TemplateService {
  constructor(
    private readonly repository: TemplateRepository,
    private readonly detailReader: TemplateDetailReader,
    private readonly accountRepository: AccountRepository,
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
    const created = await this.repository.newCreate({
      name: input.name,
      ownerId,
      fields: input.fields,
    });

    return this.withOwner(created, false);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート更新（PUT /api/templates/:id）
   *
   * ビジネスルール: 自分が所有するテンプレートのみ更新可能。
   * isUsedによる変更制限は今回実装しない（常に全項目変更可能として扱う。
   * Note実装時にNoteRepository.existsByTemplateIdを注入し制限ロジックを追加するTODO）。
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

    // 新規fieldのidはここ（Service）で採番し、Template.edit()へ渡す（template.tsのJSDocどおり）。
    const fields = input.fields.map((field) => ({
      id: field.id ?? crypto.randomUUID(),
      label: field.label,
      order: field.order,
      isRequired: field.isRequired,
    }));

    const edited = template.edit({ name: input.name, fields }, new Date());
    await this.repository.save(edited);

    return this.withOwner(edited, false);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート削除（DELETE /api/templates/:id）
   *
   * ビジネスルール: 所有者のみ削除可能。
   * isUsedによる削除制限は今回見送り（Note実装時、existsByTemplateIdで判定するTODO）。
   */
  async deleteTemplate(id: string, accountId: string): Promise<void> {
    const template = await this.repository.findById(id);
    if (!template) {
      throw new Error("Template not found");
    }
    if (!template.isOwnedBy(accountId)) {
      throw new Error("This account does not own the template");
    }

    await this.repository.delete(id);
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート詳細取得（GET /api/templates/:id）
   *
   * isUsedは今回常に false 固定で組み立てる（TODO: Note実装後のisUsed N+1対策は
   * listTemplateDetails側で行う。単体取得は元々1件なので対策不要）。
   */
  async getTemplateDetailById(id: string): Promise<TemplateDetailResult | null> {
    const detail = await this.detailReader.findDetailById(id);
    return detail ? { ...detail, isUsed: false } : null;
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
   * テンプレート一覧取得（GET /api/templates）
   *
   * isUsedは今回常に false 固定で組み立てる（TODO: Note実装後、NoteRepositoryに
   * existsByTemplateIds(templateIds): Promise<Set<string>> を追加し、1クエリで
   * バッチ判定してN+1を避ける）。
   */
  async listTemplateDetails(params: {
    ownerId?: string;
    q?: string;
  }): Promise<TemplateDetailResult[]> {
    const details = await this.detailReader.findManyDetail(params);
    return details.map((detail) => ({ ...detail, isUsed: false }));
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
);
