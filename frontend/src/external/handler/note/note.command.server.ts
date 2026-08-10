import "server-only";
import type { DeleteNoteResponse, NoteResponse } from "../../dto/note/note-dto";
import {
  createNoteRequestSchema,
  deleteNoteRequestSchema,
  editNoteRequestSchema,
  publishNoteRequestSchema,
  toNoteResponse,
  unpublishNoteRequestSchema,
} from "../../dto/note/note-dto";
import { noteService } from "../../service/note/note-service";

/**
 * 各関数の`input: unknown`について（account/template.command.server.tsと同じ方針）:
 *
 * ここはクライアントから直接呼び出せる境界（`.command.action.ts`経由）の先にある
 * DAL層で、渡された値がリクエストの形をしている保証はまだない。`unknown`は
 * narrowing（`<集約名>RequestSchema.parse()`）を経るまでプロパティへのアクセスを
 * 一切許さないため、「`.parse()`を呼ばずに未検証の値を使ってしまう」ミスをコンパイラの
 * レベルで機械的に防げる。この安全網を保つため、あえて`unknown`のままにしている。
 */

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート作成（POST /api/notes）
 *
 * ビジネスルール: 新規作成時のステータスは"Draft"。指定されたテンプレートが存在する
 * 必要がある。sectionsが未指定の場合、テンプレートのフィールドから空のセクションを自動生成。
 */
export async function createNoteCommand(
  ownerId: string,
  input: unknown,
): Promise<NoteResponse> {
  const parsed = createNoteRequestSchema.parse(input);
  const detail = await noteService.createNote(ownerId, parsed);
  return toNoteResponse(detail);
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート更新（PUT /api/notes/:id）
 *
 * ビジネスルール: ノートの所有者のみ更新可能。テンプレートのフィールド構造は変更不可。
 */
export async function editNoteCommand(
  input: unknown,
  accountId: string,
): Promise<NoteResponse> {
  const parsed = editNoteRequestSchema.parse(input);
  const detail = await noteService.editNote(parsed.id, parsed, accountId);
  return toNoteResponse(detail);
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート削除（DELETE /api/notes/:id）
 *
 * ビジネスルール: ノートの所有者のみ削除可能
 */
export async function deleteNoteCommand(
  input: unknown,
  accountId: string,
): Promise<DeleteNoteResponse> {
  const parsed = deleteNoteRequestSchema.parse(input);
  await noteService.deleteNote(parsed.id, accountId);
  return { success: true };
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート公開（POST /api/notes/:id/publish）
 *
 * ビジネスルール: 本人のノートのみ公開可能。下書きから公開済みに状態遷移。
 */
export async function publishNoteCommand(
  input: unknown,
  accountId: string,
): Promise<NoteResponse> {
  const parsed = publishNoteRequestSchema.parse(input);
  const detail = await noteService.publishNote(parsed.noteId, accountId);
  return toNoteResponse(detail);
}

/**
 * URL定義: docs/global_design/07_api_design.md「Notes（ノート）API」
 * ノート非公開（POST /api/notes/:id/unpublish）
 *
 * ビジネスルール: ノートの所有者のみ許可。公開から非公開に状態遷移。
 */
export async function unpublishNoteCommand(
  input: unknown,
  accountId: string,
): Promise<NoteResponse> {
  const parsed = unpublishNoteRequestSchema.parse(input);
  const detail = await noteService.unpublishNote(parsed.noteId, accountId);
  return toNoteResponse(detail);
}
