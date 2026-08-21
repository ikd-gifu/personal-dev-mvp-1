import { Account } from "../../domain/account/account";
import type { AccountRepository } from "../../domain/account/interface";
import { DrizzleAccountRepository } from "../../repository/account/account-repository";

/**
 * AccountService（アプリケーションサービス）
 *
 * ユースケース（業務フロー）の組み立てのみを担う。
 * DBアクセスの詳細はAccountRepository、業務ルールはAccountエンティティに委ねる。
 */
export class AccountService {
  constructor(private readonly accountRepository: AccountRepository) {}

  /**
   * 用語定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
   * ユーザー新規登録（POST /api/accounts/auth）
   *
   * ビジネスルール:
   * - 既存アカウントが存在する場合は取得、存在しない場合は新規作成
   *
   * 新規作成の場合も、OAuthログインを契機とした登録であるため、
   * AccountResponse.lastLoginAt（非nullable）を満たすようupdateOnLoginを適用する。
   *
   * 既存アカウントの検索キーはemail（providerAccountIdではない）。
   * 経緯: docs/plans/external_implementation.md「認証」節を参照。
   * database未設定のBetter Auth stateless構成では、providerAccountIdの元となる
   * user.idがログインのたびに変わり（Better Auth GitHub Issue #6447/PR #9979で
   * 既知の挙動、実機でも確認済み）、provider+providerAccountIdでの検索キーとして
   * 使えないため。
   */
  async createOrGetAccount(profile: {
    email: string;
    name: string;
    provider: string;
    providerAccountId: string;
    thumbnail?: string | null;
  }): Promise<Account> {
    const { firstName, lastName } = Account.splitProviderName(profile.name);
    const now = new Date();

    const existing = await this.accountRepository.findByEmail(profile.email);

    if (existing) {
      const updated = existing.updateOnLogin(
        { firstName, lastName, thumbnail: profile.thumbnail },
        now,
      );
      await this.accountRepository.save(updated);
      return updated;
    }

    const created = await this.accountRepository.newCreate({
      email: profile.email,
      firstName,
      lastName,
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
      thumbnail: profile.thumbnail,
    });

    const withLoginRecorded = created.updateOnLogin(
      { firstName, lastName, thumbnail: profile.thumbnail },
      now,
    );
    await this.accountRepository.save(withLoginRecorded);
    return withLoginRecorded;
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
   * 現在のアカウント取得（GET /api/accounts/me）／アカウント詳細取得（GET /api/accounts/:id）
   *
   * 「現在ログイン中のユーザーをどう特定するか」はセッション（Next.js/認証基盤）の
   * 関心事であり、AccountServiceの責務ではない。idを受け取って返すだけにすることで、
   * AccountServiceを認証基盤から独立させる。セッションからのid解決は呼び出し側
   * （frontend/src/external/handler/account/account.query.server.ts）で行う。
   */
  async getAccountById(id: string): Promise<Account | null> {
    return this.accountRepository.findById(id);
  }

  /**
   * 用語定義: frontend/docs/08_authentication.md「customSession プラグイン」
   * customSessionのキャッシュ(unstable_cache)参照用。
   * getAccountByIdと同様、セッションからのメール解決は呼び出し側の責務。
   */
  async getAccountByEmail(email: string): Promise<Account | null> {
    return this.accountRepository.findByEmail(email);
  }
}

export const accountService = new AccountService(
  new DrizzleAccountRepository(),
);
