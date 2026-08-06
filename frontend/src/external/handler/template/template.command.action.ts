"use server";

import { withAuth } from "../../../features/auth/servers/auth.guard";
import type {
  DeleteTemplateResponse,
  TemplateResponse,
} from "../../dto/template/template-dto";
import {
  createTemplateCommand,
  deleteTemplateCommand,
  editTemplateCommand,
} from "./template.command.server";

/**
 * 各関数の`input: unknown`について（account.command.action.tsと同じ方針）:
 *
 * この層（Server Action）はクライアントから直接呼び出せる入口であり、受け取った値が
 * リクエストの形をしている保証はない。ここでは`input`の中身を一切読まず、そのまま
 * `.command.server.ts`側（zodスキーマで検証する層）へ渡すだけなので、`unknown`の
 * ままにしておくことで「この関数はinputの形を知らなくてよい・知るべきでない」ことを
 * 型で明示している。より具体的な型を付けると、検証前にこの層でフィールドへアクセス
 * できてしまい、`.parse()`を経ずに未検証の値を使うミスをコンパイラが防げなくなる。
 */

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート作成（POST /api/templates）
 *
 * ビジネスルール: 認証必須。ログイン中のaccountIdがownerIdになる
 */
export async function createTemplateAction(
  input: unknown,
): Promise<TemplateResponse> {
  return withAuth(({ accountId }) => createTemplateCommand(accountId, input));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート更新（PUT /api/templates/:id）
 *
 * ビジネスルール: 自分が所有するテンプレートのみ更新可能（Owner判定はwithAuthが
 * 渡すaccountIdを使ってServiceで行う）
 */
export async function editTemplateAction(
  input: unknown,
): Promise<TemplateResponse> {
  return withAuth(({ accountId }) => editTemplateCommand(input, accountId));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Templates（テンプレート）API」
 * テンプレート削除（DELETE /api/templates/:id）
 *
 * ビジネスルール: 所有者のみ削除可能
 */
export async function deleteTemplateAction(
  input: unknown,
): Promise<DeleteTemplateResponse> {
  return withAuth(({ accountId }) => deleteTemplateCommand(input, accountId));
}
