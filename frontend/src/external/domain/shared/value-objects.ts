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

export type NoteStatusValue = "Draft" | "Publish";

/**
 * Status（VO）
 *
 * 用語定義: docs/global_design/03_ubiquitous_language.md「ノート（Note）関連」Status（ステータス）
 * ルール定義: docs/global_design/05_domain_design.md「VO（Value Object）」
 *
 * ルール:
 * - "Draft"（下書き）または "Publish"（公開）のみ
 */
export class Status {
  private constructor(public readonly value: NoteStatusValue) {}

  static create(raw: string): Status {
    if (raw !== "Draft" && raw !== "Publish") {
      throw new Error('Status must be "Draft" or "Publish"');
    }

    return new Status(raw);
  }

  isDraft(): boolean {
    return this.value === "Draft";
  }

  isPublish(): boolean {
    return this.value === "Publish";
  }
}
