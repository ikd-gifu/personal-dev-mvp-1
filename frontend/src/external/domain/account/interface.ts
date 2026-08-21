import type { Account } from "./account";

/**
 * AccountRepository（ポート）
 *
 * 集約定義: docs/global_design/05_domain_design.md
 * 「集約とトランザクション境界」＞ Account（Accountのみがトランザクション対象）
 *
 * 実装（アダプタ）は external/repository 配下に置く。
 * このファイルは external/domain の一部であり、他レイヤーに依存しない。
 */
export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<Account | null>;

  /**
   * 新規登録用。Googleログインから得られる生の値のみを受け取る。
   * id・createdAt・updatedAt は永続化層（DB）で生成し、
   * 生成後の値を含む Account を返す。
   *
   * 用語定義: docs/global_design/07_api_design.md
   * 「Accounts（アカウント）API」CreateOrGetAccountRequest
   */
  newCreate(profile: {
    email: string;
    firstName: string;
    lastName: string;
    provider: string;
    providerAccountId: string;
    thumbnail?: string | null;
  }): Promise<Account>;

  save(account: Account): Promise<void>;
}
