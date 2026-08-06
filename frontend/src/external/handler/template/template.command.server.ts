import "server-only";
import type {
  DeleteTemplateResponse,
  TemplateResponse,
} from "../../dto/template/template-dto";
import {
  createTemplateRequestSchema,
  deleteTemplateRequestSchema,
  editTemplateRequestSchema,
  toTemplateResponse,
} from "../../dto/template/template-dto";
import { templateService } from "../../service/template/template-service";

/**
 * 各関数の`input: unknown`について（account.command.server.tsと同じ方針）:
 *
 * ここはクライアントから直接呼び出せる境界（`.command.action.ts`経由）の先にある
 * DAL層で、渡された値がリクエストの形をしている保証はまだない。TypeScriptの型は
 * 実行時には存在しないため、仮に`CreateTemplateRequest`のような検証済みを装う型を
 * 付けても、実行時の安全性は`.parse()`が担保するだけで変わらない。むしろ`unknown`は
 * narrowing（`<集約名>RequestSchema.parse()`）を経るまでプロパティへのアクセスを
 * 一切許さないため、「`.parse()`を呼ばずに未検証の値を使ってしまう」ミスをコンパイラの
 * レベルで機械的に防げる。この安全網を保つため、あえて`unknown`のままにしている。
 */

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート作成（POST /api/templates）
 *
 * ビジネスルール: フィールドのorderは1から始まる連番、新規作成時のisUsedはfalse
 */
export async function createTemplateCommand(
  ownerId: string,
  input: unknown,
): Promise<TemplateResponse> {
  const parsed = createTemplateRequestSchema.parse(input);
  const detail = await templateService.createTemplate(ownerId, parsed);
  return toTemplateResponse(detail.template, detail.owner, detail.isUsed);
}

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート更新（PUT /api/templates/:id）
 *
 * ビジネスルール: 自分が所有するテンプレートのみ更新可能
 */
export async function editTemplateCommand(
  input: unknown,
  accountId: string,
): Promise<TemplateResponse> {
  const parsed = editTemplateRequestSchema.parse(input);
  const detail = await templateService.editTemplate(
    parsed.id,
    parsed,
    accountId,
  );
  return toTemplateResponse(detail.template, detail.owner, detail.isUsed);
}

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート削除（DELETE /api/templates/:id）
 *
 * ビジネスルール: 所有者のみ削除可能
 */
export async function deleteTemplateCommand(
  input: unknown,
  accountId: string,
): Promise<DeleteTemplateResponse> {
  const parsed = deleteTemplateRequestSchema.parse(input);
  await templateService.deleteTemplate(parsed.id, accountId);
  return { success: true };
}
