/**
 * Email（VO）
 *
 * 用語定義: docs/global_design/03_ubiquitous_language.md「アカウント関連」
 * ルール定義: docs/global_design/05_domain_design.md「VO（Value Object）」
 *
 * ルール:
 * - 前後の空白をトリムする
 * - 空文字は不可
 * - "@" を含むこと
 */
export class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Email {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      throw new Error("Email must not be empty");
    }

    if (!trimmed.includes("@")) {
      throw new Error('Email must contain "@"');
    }

    return new Email(trimmed);
  }
}
