import "server-only";
import type {
  GetNoteByIdRequest,
  ListNotesRequest,
  NoteResponse,
} from "../../dto/note/note-dto";
import {
  getNoteByIdRequestSchema,
  listNotesRequestSchema,
  toNoteResponse,
} from "../../dto/note/note-dto";
import { noteService } from "../../service/note/note-service";

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート詳細取得（GET /api/notes/:id）のデータアクセス層（DAL）。
 * 認証（誰が呼んでいるか）はこの関数の責務外（viewerIdは呼び出し元から受け取る）。
 *
 * ビジネスルール: 見つからない場合、nullを返す。閲覧権限がない場合もnullを返す
 * （NoteService.getNoteDetailById参照）。
 */
export async function getNoteByIdQuery(
  request: GetNoteByIdRequest,
  viewerId: string,
): Promise<NoteResponse | null> {
  const { id } = getNoteByIdRequestSchema.parse(request);
  const detail = await noteService.getNoteDetailById(id, viewerId);
  return detail ? toNoteResponse(detail) : null;
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート一覧取得（GET /api/notes）のデータアクセス層（DAL）。
 *
 * ビジネスルール: 公開済み（Publish）あるいは自分のノートを取得。
 * ownerIdを指定した場合、そのユーザーが所有するノートのみを取得。
 */
export async function listNotesQuery(
  params: ListNotesRequest,
  viewerId: string,
): Promise<NoteResponse[]> {
  const parsed = listNotesRequestSchema.parse(params);
  const details = await noteService.listNoteDetails({ ...parsed, viewerId });
  return details.map((detail) => toNoteResponse(detail));
}
