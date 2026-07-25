import type { Note } from "./note";

/**
 * NoteRepository（ポート）
 *
 * 集約定義: docs/global_design/05_domain_design.md
 * 「集約とトランザクション境界」＞ Note（Note + Sectionがトランザクション対象）
 *
 * 実装（アダプタ）は external/repository 配下に置く。
 * このファイルは external/domain の一部であり、他レイヤーに依存しない。
 */
export interface NoteRepository {
  findById(id: string): Promise<Note | null>;

  /**
   * 用語定義: docs/global_design/07_api_design.md
   * 「Notes（ノート）API」ノート一覧取得
   *
   * ビジネスルール: 公開済み（Publish）あるいは自分（viewerId）のノートのみ取得する。
   */
  findMany(params: {
    viewerId: string;
    q?: string;
    status?: "Draft" | "Publish";
    templateId?: string;
    ownerId?: string;
  }): Promise<Note[]>;

  /**
   * 新規作成用。id・createdAt・updatedAt・section.id は永続化層（DB/Repository）で採番し、
   * 採番後の値を含む Note を返す。ステータスは常に"Draft"で作成する。
   *
   * 用語定義: docs/global_design/07_api_design.md
   * 「Notes（ノート）API」CreateNoteRequest
   */
  newCreate(input: {
    title: string;
    ownerId: string;
    templateId: string;
    sections: {
      fieldId: string;
      content: string;
    }[];
  }): Promise<Note>;

  save(note: Note): Promise<void>;

  /**
   * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」ノート削除
   * 「ノートに紐づくセクションも同時に削除される」
   */
  delete(id: string): Promise<void>;

  /**
   * 用語定義: docs/global_design/03_ubiquitous_language.md
   * 「テンプレート（Template）関連」TemplateUsageCheck（利用中テンプレチェック）
   *
   * 指定されたtemplateIdを使用するNoteが存在するかを確認する。
   * Template削除時の利用中判定（アプリケーションサービス層）で使用する。
   */
  existsByTemplateId(templateId: string): Promise<boolean>;
}
