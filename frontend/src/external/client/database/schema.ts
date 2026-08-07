import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * accounts（アカウント）
 *
 * テーブル定義: docs/global_design/06_database_design.md「accounts（ユーザー）」
 *
 * id・createdAt・updatedAt・isActive はDBのデフォルト値を未指定時のフォールバックとする。
 * AccountRepository.newCreate() がこれらを受け取らない設計のため。
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    thumbnail: text("thumbnail"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [unique().on(table.provider, table.providerAccountId)],
);

/**
 * templates（テンプレート）
 *
 * テーブル定義: docs/global_design/06_database_design.md「templates（テンプレート）」
 *
 * id・updatedAt はDBのデフォルト値を未指定時のフォールバックとする。
 * TemplateRepository.newCreate() がこれらを受け取らない設計のため（accountsと同様）。
 * ownerId → accounts.id はCASCADEなし（集約を跨ぐ参照。06「ON DELETE CASCADEの使い分け」）。
 */
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => accounts.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * fields（テンプレの項目）
 *
 * テーブル定義: docs/global_design/06_database_design.md「fields（テンプレの項目）」
 *
 * templateId → templates.id はCASCADEあり（同一集約。templates削除時にfieldsも削除）。
 */
export const fields = pgTable(
  "fields",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    order: integer("order").notNull(),
    isRequired: boolean("is_required").notNull(),
  },
  (table) => [
    unique().on(table.templateId, table.order),
    check("fields_order_positive", sql`${table.order} > 0`),
  ],
);

/**
 * notes（ノート）
 *
 * テーブル定義: docs/global_design/06_database_design.md「notes（ノート）」
 *
 * id・createdAt・updatedAt・status はDBのデフォルト値を未指定時のフォールバックとする。
 * NoteRepository.newCreate() がこれらを受け取らない設計のため（accounts/templatesと同様）。
 * templateId → templates.id、ownerId → accounts.id はいずれもCASCADEなし
 * （集約を跨ぐ参照。06「ON DELETE CASCADEの使い分け」）。
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => accounts.id),
    status: text("status").notNull().default("Draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("notes_owner_idx").on(table.ownerId),
    index("notes_template_idx").on(table.templateId),
    index("notes_updated_at_idx").on(table.updatedAt.desc()),
  ],
);

/**
 * sections（ノートのセクション）
 *
 * テーブル定義: docs/global_design/06_database_design.md「sections（ノートのセクション）」
 *
 * id はDBのデフォルト値を未指定時のフォールバックとする。
 * NoteRepository.newCreate() が section.id を受け取らない設計のため。
 * noteId → notes.id はCASCADEあり（同一集約。notes削除時にsectionsも削除）。
 * fieldId → fields.id はCASCADEなし（集約を跨ぐ参照）。
 */
export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id),
    content: text("content").notNull().default(""),
  },
  (table) => [
    unique().on(table.noteId, table.fieldId),
    index("sections_note_idx").on(table.noteId),
    index("sections_field_idx").on(table.fieldId),
  ],
);

export const templatesRelations = relations(templates, ({ many, one }) => ({
  fields: many(fields),
  owner: one(accounts, {
    fields: [templates.ownerId],
    references: [accounts.id],
  }),
}));

export const fieldsRelations = relations(fields, ({ one }) => ({
  template: one(templates, {
    fields: [fields.templateId],
    references: [templates.id],
  }),
}));

export const notesRelations = relations(notes, ({ many, one }) => ({
  sections: many(sections),
  owner: one(accounts, {
    fields: [notes.ownerId],
    references: [accounts.id],
  }),
  template: one(templates, {
    fields: [notes.templateId],
    references: [templates.id],
  }),
}));

export const sectionsRelations = relations(sections, ({ one }) => ({
  note: one(notes, {
    fields: [sections.noteId],
    references: [notes.id],
  }),
  field: one(fields, {
    fields: [sections.fieldId],
    references: [fields.id],
  }),
}));
