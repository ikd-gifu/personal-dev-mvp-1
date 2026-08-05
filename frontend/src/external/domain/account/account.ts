import { Email } from "../shared/value-objects";

/**
 * Account（エンティティ／Accountチーム集約ルート）
 *
 * 用語定義: docs/global_design/03_ubiquitous_language.md「アカウント関連」
 * 属性定義: docs/global_design/05_domain_design.md「エンティティ」
 * 集約定義: docs/global_design/05_domain_design.md「集約」Accountチーム
 *
 * 登録済み、ログインしているユーザー。Note・Templateを作成し、所有する。
 */
export class Account {
  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Accountチーム（アカウントの世界）」
   *
   * ルール: firstName・lastNameのどちらかは必須（両方空はNG）
   * `new Account(...)`を呼べるのはこのファイル内のみ（コンストラクタがprivate）なので、
   * 生成経路が増えてもここでの検証から漏れることはない。
   *
   * 注記: `provider` + `providerAccountId` の組み合わせの一意性は、
   * 単一の集約内では判定できない（他アカウントの存在確認が必要）ため、
   * ここでは検証しない。永続化層（DBのUNIQUE制約）で担保する。
   */
  private constructor(
    public readonly id: string,
    public readonly email: Email,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly thumbnail: string | null,
    public readonly isActive: boolean,
    public readonly provider: string,
    public readonly providerAccountId: string,
    public readonly lastLoginAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {
    if (!firstName.trim() && !lastName.trim()) {
      throw new Error("Account must have firstName or lastName");
    }
  }

  static create(params: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    thumbnail?: string | null;
    isActive: boolean;
    provider: string;
    providerAccountId: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Account {
    const firstName = params.firstName.trim();
    const lastName = params.lastName.trim();

    return new Account(
      params.id,
      Email.create(params.email),
      firstName,
      lastName,
      params.thumbnail ?? null,
      params.isActive,
      params.provider,
      params.providerAccountId,
      params.lastLoginAt,
      params.createdAt,
      params.updatedAt,
    );
  }

  /**
   * ルール定義: docs/global_design/05_domain_design.md
   * 「ドメインロジック」＞「Accountチーム（アカウントの世界）」
   *
   * ルール: ログイン時にプロフィール情報と最終ログイン時刻を更新する
   */
  updateOnLogin(
    profile: {
      firstName: string;
      lastName: string;
      thumbnail?: string | null;
    },
    now: Date,
  ): Account {
    const firstName = profile.firstName.trim();
    const lastName = profile.lastName.trim();

    return new Account(
      this.id,
      this.email,
      firstName,
      lastName,
      profile.thumbnail ?? this.thumbnail,
      this.isActive,
      this.provider,
      this.providerAccountId,
      now,
      this.createdAt,
      now,
    );
  }

  /**
   * 用語定義: docs/global_design/07_api_design.md「Accounts（アカウント）API」
   * AccountResponse.fullName に対応
   */
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  /**
   * ルール定義: docs/global_design/07_api_design.md
   * 「Accounts（アカウント）API」CreateOrGetAccountRequest ビジネスルール
   * 「プロバイダーからnameの形で連携されるので分割する」
   *
   * ルール: 半角スペース区切りで最初のトークンをfirstName、残りをlastNameとする
   */
  static splitProviderName(name: string): {
    firstName: string;
    lastName: string;
  } {
    const [firstName = "", ...rest] = name.trim().split(/\s+/);
    return { firstName, lastName: rest.join(" ") };
  }
}
