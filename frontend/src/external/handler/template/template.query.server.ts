import "server-only";
import type {
  GetTemplateByIdRequest,
  ListTemplatesRequest,
  TemplateResponse,
} from "../../dto/template/template-dto";
import {
  getTemplateByIdRequestSchema,
  listTemplatesRequestSchema,
  toTemplateResponse,
} from "../../dto/template/template-dto";
import { templateService } from "../../service/template/template-service";

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート詳細取得（GET /api/templates/:id）のデータアクセス層（DAL）。
 * 認証（誰が呼んでいるか）はこの関数の責務外。
 *
 * `.query.action.ts`（"use server"）経由でクライアントから直接呼び出せるため、
 * TypeScriptの型だけでは実行時の不正な値を防げない。境界（DTO）でuuid形式を検証する
 * （account.query.server.tsには同様の検証がなく非対称だが、Accountの既知の未修正の
 * 問題として別タスクで揃える）。
 *
 * ビジネスルール: 存在しないIDの場合はnullを返す
 */
export async function getTemplateByIdQuery(
  request: GetTemplateByIdRequest,
): Promise<TemplateResponse | null> {
  const { id } = getTemplateByIdRequestSchema.parse(request);
  const detail = await templateService.getTemplateDetailById(id);
  return detail
    ? toTemplateResponse(detail.template, detail.owner, detail.isUsed)
    : null;
}

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート一覧取得（GET /api/templates）のデータアクセス層（DAL）。
 *
 * getTemplateByIdQueryと同様の理由で、境界（DTO）でownerIdのuuid形式を検証する。
 *
 * ビジネスルール: ownerIdを指定するとそのユーザーのテンプレートのみ表示。
 * qはテンプレート名のキーワード検索
 */
export async function listTemplatesQuery(
  params: ListTemplatesRequest,
): Promise<TemplateResponse[]> {
  const parsed = listTemplatesRequestSchema.parse(params);
  const details = await templateService.listTemplateDetails(parsed);
  return details.map((detail) =>
    toTemplateResponse(detail.template, detail.owner, detail.isUsed),
  );
}
