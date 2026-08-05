import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
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
