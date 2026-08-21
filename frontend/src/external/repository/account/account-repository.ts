import { and, eq } from "drizzle-orm";
import { db } from "../../client/database";
import { accounts } from "../../client/database/schema";
import { Account } from "../../domain/account/account";
import type { AccountRepository } from "../../domain/account/interface";

/**
 * AccountRepository（アダプタ）
 *
 * ポート定義: frontend/src/external/domain/account/interface.ts
 *
 * Drizzle（frontend/src/external/client/database）による永続化実装。
 */
export class DrizzleAccountRepository implements AccountRepository {
  async findById(id: string): Promise<Account | null> {
    const row = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
    });

    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    const row = await db.query.accounts.findFirst({
      where: eq(accounts.email, email),
    });

    return row ? toDomain(row) : null;
  }

  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<Account | null> {
    const row = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.provider, provider),
        eq(accounts.providerAccountId, providerAccountId),
      ),
    });

    return row ? toDomain(row) : null;
  }

  async newCreate(profile: {
    email: string;
    firstName: string;
    lastName: string;
    provider: string;
    providerAccountId: string;
    thumbnail?: string | null;
  }): Promise<Account> {
    const [row] = await db
      .insert(accounts)
      .values({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
        thumbnail: profile.thumbnail ?? null,
      })
      .returning();

    return toDomain(row);
  }

  async save(account: Account): Promise<void> {
    await db
      .update(accounts)
      .set({
        firstName: account.firstName,
        lastName: account.lastName,
        thumbnail: account.thumbnail,
        isActive: account.isActive,
        lastLoginAt: account.lastLoginAt,
        updatedAt: account.updatedAt,
      })
      .where(eq(accounts.id, account.id));
  }
}

function toDomain(row: typeof accounts.$inferSelect): Account {
  return Account.create({
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    thumbnail: row.thumbnail,
    isActive: row.isActive,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
