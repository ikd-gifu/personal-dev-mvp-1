"use server";

import { withAuth } from "../../../features/auth/servers/auth.guard";
import type {
  GetNoteByIdRequest,
  ListNotesRequest,
  NoteResponse,
} from "../../dto/note/note-dto";
import { getNoteByIdRequestSchema } from "../../dto/note/note-dto";
import { getNoteByIdQuery, listNotesQuery } from "./note.query.server";

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート詳細取得（GET /api/notes/:id）
 *
 * `.query.action.ts`はクライアントから直接呼び出せるServer Actionの入口のため、
 * ここでもgetNoteByIdRequestSchemaでuuid形式を検証してからquery.server.tsへ渡す
 * （query.server.ts側の検証と合わせて境界の多重防御。Templateの実装方針を踏襲）。
 * withAuthが渡すaccountIdをviewerIdとしてServiceへ渡す。
 *
 * ビジネスルール: 認証必須
 */
export async function getNoteByIdAction(
  request: GetNoteByIdRequest,
): Promise<NoteResponse | null> {
  const parsed = getNoteByIdRequestSchema.parse(request);
  return withAuth(({ accountId }) => getNoteByIdQuery(parsed, accountId));
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート一覧取得（GET /api/notes）
 *
 * ビジネスルール: 認証必須
 */
export async function listNotesAction(
  params: ListNotesRequest,
): Promise<NoteResponse[]> {
  return withAuth(({ accountId }) => listNotesQuery(params, accountId));
}
