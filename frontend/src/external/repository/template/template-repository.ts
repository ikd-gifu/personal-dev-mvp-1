import { and, eq, ilike, inArray } from "drizzle-orm";
import { db } from "../../client/database";
import type { accounts } from "../../client/database/schema";
import { fields, templates } from "../../client/database/schema";
import type { TemplateRepository } from "../../domain/template/interface";
import { Template } from "../../domain/template/template";

/**
 * TemplateDetail（ドメインportには含めない読み取り専用モデル）
 *
 * 用語定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」TemplateResponse
 *
 * 06_database_design.md「集約間の結合度: 他の集約への参照はIDのみ」の原則により、
 * ドメインport（TemplateRepository）にはowner実データを含めない。表示用の結合済み
 * データ（owner名等）はこのファイル（external/repository）にのみ存在する。
 */
export interface TemplateDetail {
  template: Template;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    thumbnail: string | null;
  };
}

/**
 * TemplateDetailReader（ドメインportには含めないクエリ専用インターフェース）
 *
 * Template一覧・詳細のowner結合済み取得のみを担う。コマンド側の`TemplateRepository`
 * とは別に、Serviceのコンストラクタで独立して受け取る（CQRS分離を可視化するため）。
 */
export interface TemplateDetailReader {
  findDetailById(id: string): Promise<TemplateDetail | null>;
  findManyDetail(params: {
    ownerId?: string;
    q?: string;
  }): Promise<TemplateDetail[]>;
}

/**
 * DrizzleTemplateRepository（アダプタ）
 *
 * ポート定義: frontend/src/external/domain/template/interface.ts
 *
 * Drizzle（frontend/src/external/client/database）による永続化実装。
 */
export class DrizzleTemplateRepository
  implements TemplateRepository, TemplateDetailReader
{
  async findById(id: string): Promise<Template | null> {
    const row = await db.query.templates.findFirst({
      where: eq(templates.id, id),
      with: { fields: true },
    });

    return row ? toDomain(row, row.fields) : null;
  }

  async findMany(params: {
    ownerId?: string;
    q?: string;
  }): Promise<Template[]> {
    const rows = await db.query.templates.findMany({
      where: buildWhere(params),
      with: { fields: true },
    });

    return rows.map((row) => toDomain(row, row.fields));
  }

  /**
   * 既知の未修正の問題: DBへのINSERTを先に実行し、その戻り値をtoDomain()
   * （内部でTemplate.create()を呼ぶ）でドメインモデルへ変換する順序になっている。
   * そのため、ドメイン層の不変条件（field.order重複禁止等）に違反する値でも、
   * 先にDBへ書き込まれてから例外が投げられる（account-repository.tsの
   * newCreateと同じ既知の問題を踏襲）。
   */
  async newCreate(input: {
    name: string;
    ownerId: string;
    fields: { label: string; order: number; isRequired: boolean }[];
  }): Promise<Template> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(templates)
        .values({ name: input.name, ownerId: input.ownerId })
        .returning();

      const fieldRows = input.fields.length
        ? await tx
            .insert(fields)
            .values(
              input.fields.map((field) => ({
                templateId: row.id,
                label: field.label,
                order: field.order,
                isRequired: field.isRequired,
              })),
            )
            .returning()
        : [];

      return toDomain(row, fieldRows);
    });
  }

  async save(template: Template): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(templates)
        .set({ name: template.name, updatedAt: template.updatedAt })
        .where(eq(templates.id, template.id));

      const existingFields = await tx
        .select({ id: fields.id })
        .from(fields)
        .where(eq(fields.templateId, template.id));
      const existingIds = new Set(existingFields.map((field) => field.id));
      const nextIds = new Set(template.fields.map((field) => field.id));

      // 差分方式（DBのみに存在→DELETE、両方に存在→UPDATE、渡された側のみに存在→INSERT）。
      // 全削除→再INSERTは、sections→fieldsがCASCADEなし参照のため不採用
      // （field.idが変わると既存ノートの記入内容が孤立・破損するリスクがある）。
      const deleteIds = [...existingIds].filter((id) => !nextIds.has(id));
      if (deleteIds.length) {
        await tx.delete(fields).where(inArray(fields.id, deleteIds));
      }

      const fieldsToUpdate = template.fields.filter((field) =>
        existingIds.has(field.id),
      );
      const fieldsToInsert = template.fields.filter(
        (field) => !existingIds.has(field.id),
      );

      // fieldsにはunique(templateId, order)制約があるため、2件のorderを
      // 入れ替えるような更新を1件ずつ最終値でUPDATEすると、途中経過で
      // 一時的に重複し制約違反になる。一旦重複しない仮のorderへ退避してから
      // 最終値へ更新する。
      const TEMP_ORDER_OFFSET = 1_000_000;
      for (const field of fieldsToUpdate) {
        await tx
          .update(fields)
          .set({ order: field.order + TEMP_ORDER_OFFSET })
          .where(eq(fields.id, field.id));
      }
      for (const field of fieldsToUpdate) {
        await tx
          .update(fields)
          .set({
            label: field.label,
            order: field.order,
            isRequired: field.isRequired,
          })
          .where(eq(fields.id, field.id));
      }

      if (fieldsToInsert.length) {
        await tx.insert(fields).values(
          fieldsToInsert.map((field) => ({
            id: field.id,
            templateId: template.id,
            label: field.label,
            order: field.order,
            isRequired: field.isRequired,
          })),
        );
      }
    });
  }

  /**
   * 利用中（isUsed）かどうかの判定はアプリケーションサービス層の責務。
   * fieldsはON DELETE CASCADEで自動削除される。
   */
  async delete(id: string): Promise<void> {
    await db.delete(templates).where(eq(templates.id, id));
  }

  async findDetailById(id: string): Promise<TemplateDetail | null> {
    const row = await db.query.templates.findFirst({
      where: eq(templates.id, id),
      with: { fields: true, owner: true },
    });

    return row ? toDetail(row) : null;
  }

  async findManyDetail(params: {
    ownerId?: string;
    q?: string;
  }): Promise<TemplateDetail[]> {
    const rows = await db.query.templates.findMany({
      where: buildWhere(params),
      with: { fields: true, owner: true },
    });

    return rows.map((row) => toDetail(row));
  }
}

function buildWhere(params: { ownerId?: string; q?: string }) {
  const conditions = [];
  if (params.ownerId) {
    conditions.push(eq(templates.ownerId, params.ownerId));
  }
  if (params.q) {
    conditions.push(ilike(templates.name, `%${params.q}%`));
  }

  return conditions.length ? and(...conditions) : undefined;
}

function toDomain(
  row: typeof templates.$inferSelect,
  fieldRows: (typeof fields.$inferSelect)[],
): Template {
  return Template.create({
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    fields: fieldRows.map((field) => ({
      id: field.id,
      label: field.label,
      order: field.order,
      isRequired: field.isRequired,
    })),
    updatedAt: row.updatedAt,
  });
}

function toDetail(
  row: typeof templates.$inferSelect & {
    fields: (typeof fields.$inferSelect)[];
    owner: typeof accounts.$inferSelect;
  },
): TemplateDetail {
  return {
    template: toDomain(row, row.fields),
    owner: {
      id: row.owner.id,
      firstName: row.owner.firstName,
      lastName: row.owner.lastName,
      thumbnail: row.owner.thumbnail,
    },
  };
}
