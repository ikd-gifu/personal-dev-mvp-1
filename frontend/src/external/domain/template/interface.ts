import type { Template } from "./template";

/**
 * TemplateRepository（ポート）
 *
 * 集約定義: docs/global_design/05_domain_design.md
 * 「集約とトランザクション境界」＞ Template（Template + Fieldがトランザクション対象）
 *
 * 実装（アダプタ）は external/repository 配下に置く。
 * このファイルは external/domain の一部であり、他レイヤーに依存しない。
 */
export interface TemplateRepository {
  findById(id: string): Promise<Template | null>;

  /**
   * 用語定義: docs/global_design/07_api_design.md
   * 「Templates（テンプレート）API」テンプレート一覧取得
   */
  findMany(params: { ownerId?: string; q?: string }): Promise<Template[]>;

  /**
   * 新規作成用。id・field.id・updatedAt は永続化層（DB/Repository）で採番し、
   * 採番後の値を含む Template を返す。
   *
   * 用語定義: docs/global_design/07_api_design.md
   * 「Templates（テンプレート）API」CreateTemplateRequest
   */
  newCreate(input: {
    name: string;
    ownerId: string;
    fields: {
      label: string;
      order: number;
      isRequired: boolean;
    }[];
  }): Promise<Template>;

  save(template: Template): Promise<void>;

  /**
   * 用語定義: docs/global_design/07_api_design.md
   * 「Templates（テンプレート）API」テンプレート削除
   *
   * 利用中（isUsed = true）かどうかの判定はアプリケーションサービス層で行い、
   * このメソッドは削除の実行のみを担う。
   */
  delete(id: string): Promise<void>;
}
