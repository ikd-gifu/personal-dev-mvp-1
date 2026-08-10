"use server";

import { withAuth } from "../../../features/auth/servers/auth.guard";
import type { DeleteNoteResponse, NoteResponse } from "../../dto/note/note-dto";
import {
  createNoteCommand,
  deleteNoteCommand,
  editNoteCommand,
  publishNoteCommand,
  unpublishNoteCommand,
} from "./note.command.server";

/**
 * 各関数の`input: unknown`について（account/template.command.action.tsと同じ方針）:
 *
 * この層（Server Action）はクライアントから直接呼び出せる入口であり、受け取った値が
 * リクエストの形をしている保証はない。ここでは`input`の中身を一切読まず、そのまま
 * `.command.server.ts`側（zodスキーマで検証する層）へ渡すだけなので、`unknown`の
 * ままにしておくことで「この関数はinputの形を知らなくてよい・知るべきでない」ことを
 * 型で明示している。
 */

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート作成（POST /api/notes）
 *
 * ビジネスルール: 認証必須。ログイン中のaccountIdがownerIdになる
 */
export async function createNoteAction(input: unknown): Promise<NoteResponse> {
  return withAuth(({ accountId }) => createNoteCommand(accountId, input));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート更新（PUT /api/notes/:id）
 *
 * ビジネスルール: ノートの所有者のみ更新可能（Owner判定はwithAuthが渡すaccountIdを
 * 使ってServiceで行う）
 */
export async function editNoteAction(input: unknown): Promise<NoteResponse> {
  return withAuth(({ accountId }) => editNoteCommand(input, accountId));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート削除（DELETE /api/notes/:id）
 *
 * ビジネスルール: ノートの所有者のみ削除可能
 */
export async function deleteNoteAction(
  input: unknown,
): Promise<DeleteNoteResponse> {
  return withAuth(({ accountId }) => deleteNoteCommand(input, accountId));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート公開（POST /api/notes/:id/publish）
 *
 * ビジネスルール: 本人のノートのみ公開可能
 */
export async function publishNoteAction(input: unknown): Promise<NoteResponse> {
  return withAuth(({ accountId }) => publishNoteCommand(input, accountId));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート非公開（POST /api/notes/:id/unpublish）
 *
 * ビジネスルール: ノートの所有者のみ許可
 */
export async function unpublishNoteAction(
  input: unknown,
): Promise<NoteResponse> {
  return withAuth(({ accountId }) => unpublishNoteCommand(input, accountId));
}
