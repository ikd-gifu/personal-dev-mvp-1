import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "../../client/database";
import {
  type accounts,
  type fields,
  notes,
  sections,
} from "../../client/database/schema";
import type { NoteRepository } from "../../domain/note/interface";
import { Note } from "../../domain/note/note";

/**
 * NoteDetail（ドメインportには含めない読み取り専用モデル）
 *
 * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」NoteResponse
 *
 * ドメインのSectionはfieldLabel/isRequiredを持たない（Templateという別集約の情報のため）。
 * 表示用に結合済みのsections（fieldLabel/isRequired込み）はこのファイル（external/repository）
 * にのみ存在する（06_database_design.md「集約間の結合度: 他の集約への参照はIDのみ」の原則）。
 */
export interface NoteDetail {
  note: Note;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    thumbnail: string | null;
  };
  sections: {
    id: string;
    fieldId: string;
    fieldLabel: string;
    content: string;
    isRequired: boolean;
  }[];
}

/**
 * NoteDetailReader（ドメインportには含めないクエリ専用インターフェース）
 *
 * Note一覧・詳細のowner/field結合済み取得のみを担う。コマンド側の`NoteRepository`
 * とは別に、Serviceのコンストラクタで独立して受け取る（CQRS分離を可視化するため）。
 */
export interface NoteDetailReader {
  findDetailById(id: string): Promise<NoteDetail | null>;
  findManyDetail(params: {
    viewerId: string;
    q?: string;
    status?: "Draft" | "Publish";
    templateId?: string;
    ownerId?: string;
  }): Promise<NoteDetail[]>;
}

/**
 * DrizzleNoteRepository（アダプタ）
 *
 * ポート定義: frontend/src/external/domain/note/interface.ts
 *
 * Drizzle（frontend/src/external/client/database）による永続化実装。
 */
export class DrizzleNoteRepository implements NoteRepository, NoteDetailReader {
  async findById(id: string): Promise<Note | null> {
    const row = await db.query.notes.findFirst({
      where: eq(notes.id, id),
      with: { sections: true },
    });

    return row ? toDomain(row, row.sections) : null;
  }

  async findMany(params: {
    viewerId: string;
    q?: string;
    status?: "Draft" | "Publish";
    templateId?: string;
    ownerId?: string;
  }): Promise<Note[]> {
    const rows = await db.query.notes.findMany({
      where: buildWhere(params),
      with: { sections: true },
    });

    return rows.map((row) => toDomain(row, row.sections));
  }

  /**
   * 既知の未修正の問題: DBへのINSERTを先に実行し、その戻り値をtoDomain()
   * （内部でNote.create()を呼ぶ）でドメインモデルへ変換する順序になっている。
   * そのため、ドメイン層の不変条件に違反する値でも、先にDBへ書き込まれてから
   * 例外が投げられる（account-repository.ts/template-repository.tsと同じ既知の問題を踏襲）。
   */
  async newCreate(input: {
    title: string;
    ownerId: string;
    templateId: string;
    sections: {
      fieldId: string;
      content: string;
    }[];
  }): Promise<Note> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(notes)
        .values({
          title: input.title,
          ownerId: input.ownerId,
          templateId: input.templateId,
        })
        .returning();

      const sectionRows = input.sections.length
        ? await tx
            .insert(sections)
            .values(
              input.sections.map((section) => ({
                noteId: row.id,
                fieldId: section.fieldId,
                content: section.content,
              })),
            )
            .returning()
        : [];

      return toDomain(row, sectionRows);
    });
  }

  /**
   * templateId不変（3-4）のため、sectionsの追加・削除は発生しない。
   * Templateのような差分INSERT/DELETEは不要で、全件UPDATEのみでよい。
   */
  async save(note: Note): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(notes)
        .set({
          title: note.title,
          status: note.status.value,
          updatedAt: note.updatedAt,
        })
        .where(eq(notes.id, note.id));

      for (const section of note.sections) {
        await tx
          .update(sections)
          .set({ content: section.content })
          .where(eq(sections.id, section.id));
      }
    });
  }

  /**
   * ノートに紐づくセクションも同時に削除される（sectionsはON DELETE CASCADE）。
   */
  async delete(id: string): Promise<void> {
    await db.delete(notes).where(eq(notes.id, id));
  }

  /**
   * 用語定義: docs/global_design/03_ubiquitous_language.md
   * 「テンプレート（Template）関連」TemplateUsageCheck（利用中テンプレチェック）
   */
  async existsByTemplateId(templateId: string): Promise<boolean> {
    const row = await db.query.notes.findFirst({
      where: eq(notes.templateId, templateId),
      columns: { id: true },
    });

    return row !== undefined;
  }

  async findDetailById(id: string): Promise<NoteDetail | null> {
    const row = await db.query.notes.findFirst({
      where: eq(notes.id, id),
      with: {
        sections: { with: { field: true } },
        owner: true,
      },
    });

    return row ? toDetail(row) : null;
  }

  async findManyDetail(params: {
    viewerId: string;
    q?: string;
    status?: "Draft" | "Publish";
    templateId?: string;
    ownerId?: string;
  }): Promise<NoteDetail[]> {
    const rows = await db.query.notes.findMany({
      where: buildWhere(params),
      with: {
        sections: { with: { field: true } },
        owner: true,
      },
    });

    return rows.map((row) => toDetail(row));
  }
}

/**
 * 用語定義: docs/global_design/07_api_design.md「Notes（ノート）API」ビジネスルール
 * 「公開済み（Publish）あるいは自分のノートは下書きも取得」
 *
 * viewerId必須の可視性条件をANDのベースとし、q/status/templateId/ownerIdは
 * 追加のAND条件として絞り込む（findMany/findManyDetail共通）。
 */
function buildWhere(params: {
  viewerId: string;
  q?: string;
  status?: "Draft" | "Publish";
  templateId?: string;
  ownerId?: string;
}) {
  const conditions = [
    or(eq(notes.status, "Publish"), eq(notes.ownerId, params.viewerId)),
  ];
  if (params.q) {
    conditions.push(ilike(notes.title, `%${params.q}%`));
  }
  if (params.status) {
    conditions.push(eq(notes.status, params.status));
  }
  if (params.templateId) {
    conditions.push(eq(notes.templateId, params.templateId));
  }
  if (params.ownerId) {
    conditions.push(eq(notes.ownerId, params.ownerId));
  }

  return and(...conditions);
}

function toDomain(
  row: typeof notes.$inferSelect,
  sectionRows: (typeof sections.$inferSelect)[],
): Note {
  return Note.create({
    id: row.id,
    title: row.title,
    ownerId: row.ownerId,
    templateId: row.templateId,
    sections: sectionRows.map((section) => ({
      id: section.id,
      fieldId: section.fieldId,
      content: section.content,
    })),
    status: row.status as "Draft" | "Publish",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toDetail(
  row: typeof notes.$inferSelect & {
    sections: (typeof sections.$inferSelect & {
      field: typeof fields.$inferSelect;
    })[];
    owner: typeof accounts.$inferSelect;
  },
): NoteDetail {
  return {
    note: toDomain(row, row.sections),
    owner: {
      id: row.owner.id,
      firstName: row.owner.firstName,
      lastName: row.owner.lastName,
      thumbnail: row.owner.thumbnail,
    },
    sections: row.sections.map((section) => ({
      id: section.id,
      fieldId: section.fieldId,
      fieldLabel: section.field.label,
      content: section.content,
      isRequired: section.field.isRequired,
    })),
  };
}
