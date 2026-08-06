"use server";

import { withAuth } from "../../../features/auth/servers/auth.guard";
import type {
  GetTemplateByIdRequest,
  ListTemplatesRequest,
  TemplateResponse,
} from "../../dto/template/template-dto";
import { getTemplateByIdRequestSchema } from "../../dto/template/template-dto";
import {
  getTemplateByIdQuery,
  listTemplatesQuery,
} from "./template.query.server";

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート詳細取得（GET /api/templates/:id）
 *
 * `.query.action.ts`はクライアントから直接呼び出せるServer Actionの入口のため、
 * ここでもgetTemplateByIdRequestSchemaでuuid形式を検証してからquery.server.tsへ渡す
 * （query.server.ts側の検証と合わせて境界の多重防御）。
 *
 * ビジネスルール: 認証必須
 */
export async function getTemplateByIdAction(
  request: GetTemplateByIdRequest,
): Promise<TemplateResponse | null> {
  const parsed = getTemplateByIdRequestSchema.parse(request);
  return withAuth(() => getTemplateByIdQuery(parsed));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート一覧取得（GET /api/templates）
 *
 * ビジネスルール: 認証必須
 */
export async function listTemplatesAction(
  params: ListTemplatesRequest,
): Promise<TemplateResponse[]> {
  return withAuth(() => listTemplatesQuery(params));
}
