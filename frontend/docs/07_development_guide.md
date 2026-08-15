# 開発ガイド

## 新規画面追加フロー

### 1. ルート設計

適切なルートグループを選択：

- `(guest)` - 未ログインユーザー向け
- `(authenticated)` - ログイン必須

### 2. ページ作成

```bash
# 例：ノート詳細画面
mkdir -p app/\(authenticated\)/notes/\[noteId\]
touch app/\(authenticated\)/notes/\[noteId\]/page.tsx
touch app/\(authenticated\)/notes/\[noteId\]/loading.tsx
```

### 3. Feature実装

```bash
# Featureモジュール作成
mkdir -p features/note/components/server
mkdir -p features/note/components/client/NoteDetail
mkdir -p features/note/hooks
mkdir -p features/note/types
```

### 4. 実装チェックリスト

- [ ] ページコンポーネント（RSC）
- [ ] サーバーテンプレート
- [ ] クライアントコンポーネント（Container/Presenter）
- [ ] カスタムフック
- [ ] Server Actions
- [ ] 型定義
- [ ] ローディング状態
- [ ] エラーハンドリング

## コーディング規約

### ファイル命名規則

```
- コンポーネント: PascalCase.tsx
- フック: useCamelCase.ts
- ユーティリティ: camelCase.ts
- 型定義: types/index.ts
- Server Actions: camelCase.action.ts
```

### インポート順序

```ts
// 1. React/Next
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 2. 外部ライブラリ
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

// 3. 内部モジュール（絶対パス）
import { Button } from '@/shared/components/ui/button'
import { useAuth } from '@/shared/hooks/use-auth'

// 4. 相対パス
import { NoteCard } from './NoteCard'
import type { NoteListProps } from './types'
```

### コンポーネント構造

```tsx
// 1. 型定義
interface ComponentProps {
  // ...
}

// 2. コンポーネント定義
export function Component({ prop1, prop2 }: ComponentProps) {
  // 3. フック
  const router = useRouter()
  const { data } = useQuery()

  // 4. ローカル状態
  const [state, setState] = useState()

  // 5. 副作用
  useEffect(() => {}, [])

  // 6. ハンドラー（必ずuseCallbackを使用）
  const handleClick = useCallback(() => {
    // 処理
  }, [/* 依存配列 */])

  // 7. レンダリング
  return <div>...</div>
}
```

> **注意**: 「ハンドラーは必ずuseCallbackを使用」は、React公式ドキュメントの一般的な推奨（useCallbackは最適化目的の手段であり、デフォルトで使うべきものではない）とは逆方向の規約である。本プロジェクトでは意図的にこの規約を採用する。

## 型定義ガイドライン

### 基本的な型定義

```ts
// ❌ 避けるべき
const data: any = {}
const items: Array<Object> = []

// ✅ 推奨
const data: UserData = {}
const items: Item[] = []
```

### ユーティリティ型の活用

```ts
// Partial（一部のプロパティ）
type UpdateNoteInput = Partial<Note>

// Omit（特定のプロパティを除外）
type CreateNoteInput = Omit<Note, 'id' | 'createdAt'>

// Pick（特定のプロパティのみ）
type NotePreview = Pick<Note, 'id' | 'title' | 'status'>
```

### Next.js グローバル型定義

Next.js 15以降では、`LayoutProps`と`PageProps`がグローバルに利用可能です。importする必要はありません。

Layout Component

```tsx
// app/(authenticated)/layout.tsx
export default function AuthenticatedLayout(props: LayoutProps<'/'>) {
  return (
    <AuthenticatedLayoutWrapper>
      {props.children}
    </AuthenticatedLayoutWrapper>
  )
}
```

Page Component

```tsx
// app/notes/[noteId]/page.tsx
export default async function NotePage(props: PageProps<'/notes/[noteId]'>) {
  const params = await props.params
  const searchParams = await props.searchParams

  return <NoteDetailTemplate noteId={params.noteId} />
}
```

型の詳細

- `LayoutProps<T>`: Tはルートパス。`children`と`params`を含む
- `PageProps<T>`: Tはルートパス。`params`と`searchParams`を含む
- 両方ともPromiseを返すため、`await`が必要

## Server ActionsとServer Functions

> **注意**: 本セクションの関数名（`getNoteByIdQuery`、`getNoteByIdQueryAction`、`updateNoteCommand`など）は命名規則を示すための例であり、実際の`account`/`template`/`note`実装とは一致しない箇所がある。特にAction関数（`*.action.ts`）は、既存実装では`Query`/`Command`の接尾辞を付けず`xxxAction`（例: `getAccountByIdAction`, `createTemplateAction`, `createNoteAction`）で統一されている。またQuery関数（例: `getNoteByIdQuery`）は実際には`viewerId`を第2引数に取る（[06_tanstack_query.md](./06_tanstack_query.md)の注意書き参照）。命名規則そのものはこのセクションの方針に従いつつ、実装時は既存実装のシグネチャを正として扱うこと。

### 命名規則

`external/handler`ディレクトリ内の関数は、以下の命名規則に従ってください：

#### Server Functions（`*.server.ts`）

- Query（読み取り）: `xxxQuery` または `xxxQueryServer`
  - 例: `getNoteByIdQuery`, `listNotesQuery`
- Command（書き込み）: `xxxCommand` または `xxxCommandServer`
  - 例: `createNoteCommand`, `updateNoteCommand`

```ts
// ❌ 悪い例
export async function getNoteByIdServer(id: string) { ... }

// ✅ 良い例
export async function getNoteByIdQuery(id: string) { ... }
export async function createNoteCommand(data: CreateNoteInput) { ... }
```

#### Server Actions（`*.action.ts`）

Server Actionsは、対応するServer FunctionにActionサフィックスを付けます：

- Query Actions: `xxxQueryAction`
  - 例: `getNoteByIdQueryAction`, `listNotesQueryAction`
- Command Actions: `xxxCommandAction`
  - 例: `createNoteCommandAction`, `updateNoteCommandAction`

### 重要な使い分けルール

RSC (React Server Component) から呼び出す場合は必ず`*Query`/`*Command`関数を使用すること。`*Action`関数は使用しない。

- `*Action`: Client Componentやフォームアクションからのみ OK
- `*Query`/`*Command`: Server Component (`page.tsx`, `layout.tsx`, `PageTemplate.tsx`) からはこちらを使用

| 呼び出し元 | 使用すべき関数 | 例 |
| --- | --- | --- |
| Client Component | `*Action` | `useQuery`の`queryFn`、フォームsubmit |
| Server Component (RSC) | `*Query`/`*Command` | `page.tsx`, `layout.tsx`, `PageTemplate.tsx` |

認証チェックは、Query/Command関数自身が行うのではなく、呼び出し元で解決される点に注意してください。

- RSCからの呼び出し: ルートグループのLayout（`(authenticated)/layout.tsx` → `AuthenticatedLayoutWrapper`）が事前に`requireAuthServer()`で認証チェック済み
- Client Componentからの呼び出し: Action層の`withAuth()`が認証チェックと`accountId`の解決を行い、Query/Command関数に渡す

```ts
// external/handler/note/note.command.action.ts
"use server";
import { withAuth } from "@/features/auth/servers/auth.guard";
import { createNoteCommand } from "./note.command.server";

export async function createNoteCommandAction(request: CreateNoteRequest) {
  return withAuth(({ accountId }) => createNoteCommand(request, accountId));
}
```

使用例（Client Component）:

```ts
// features/note/hooks/useNoteListQuery.ts
export function useNoteListQuery(filters?: NoteFilters) {
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn: () => listNoteQueryAction(filters), // ✅ Client ComponentからはAction
  })
}
```

使用例（Server Component）:

```tsx
// app/(authenticated)/notes/page.tsx
export default async function NotesPage() {
  const notes = await listNoteQuery() // ✅ RSCからはQuery/Command

  return <NoteList notes={notes} />
}
```

使用例（layout.tsx - generateMetadata）:

```ts
// app/(authenticated)/notes/[id]/layout.tsx
export async function generateMetadata({ params }: LayoutProps) {
  const id = (await params).id
  const note = await getNoteByIdQuery({ id }) // ✅ RSCからはQuery/Command

  return {
    title: note ? `${note.title} | Mini Notion` : 'ノート詳細 | Mini Notion'
  }
}
```

## テスト戦略

単体テスト

```ts
// features/note/utils/validation.test.ts
import { describe, it, expect } from 'vitest'
import { validateNoteTitle } from './validation'

describe('validateNoteTitle', () => {
  it('空文字を拒否する', () => {
    expect(validateNoteTitle('')).toBe(false)
  })

  it('100文字以内を許可する', () => {
    expect(validateNoteTitle('a'.repeat(100))).toBe(true)
  })
})
```

統合テスト

```tsx
// features/note/components/client/NoteList/NoteList.test.tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NoteList } from './NoteList'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('NoteList', () => {
  it('ノート一覧を表示する', async () => {
    render(<NoteList />, { wrapper: createWrapper() })

    expect(await screen.findByText('ノート1')).toBeInTheDocument()
  })
})
```

> テストランナー（Vitest等）の正式な導入可否と、最低限どのレイヤーを実際にテストするかは、[04_features_structure.md](./04_features_structure.md)のベストプラクティスに記載の通りここで決定する。

## パフォーマンス最適化

動的インポート

```tsx
// 重いコンポーネントの遅延読み込み
const RichTextEditor = dynamic(
  () => import('@/shared/components/RichTextEditor'),
  {
    loading: () => <EditorSkeleton />,
    ssr: false
  }
)
```

画像最適化

```tsx
import Image from 'next/image'

<Image
  src="/avatar.png"
  alt="User Avatar"
  width={40}
  height={40}
  priority // Above the fold画像
/>
```

バンドルサイズ削減

```ts
// ❌ 全体インポート
import _ from 'lodash'

// ✅ 個別インポート
import debounce from 'lodash/debounce'
```

## トランザクション管理（externalディレクトリ）

> 注意: このセクションは`external`ディレクトリ内のRepository/Service層の実装に関する内容です。
>
> - 適用範囲: `external`ディレクトリのみ
> - 適用外: `features`、`shared`、`app`ディレクトリには適用されません
>
> Next.js自体をクリーンアーキテクチャにしているわけではありません。Next.jsのApp Router、Server Components、Server Actionsといった機能は通常通り使用し、データアクセス層（Repository/Service）のみをクリーンアーキテクチャで設計しています。

### アーキテクチャ概要

```
Service層 (use case)
    ↓ 依存 (interface)
Domain層 (ITransactionManager, IRepository)
    ↑ 実装
Repository層 (TransactionRepository, Repository実装)
    ↓ 依存
Client層 (db, Drizzle ORM)
```

### トランザクションが必要な操作

複数テーブルへの書き込み操作

- 集約（Aggregate）内の複数エンティティを操作する場合
  - 例: Template（template + fields）、Note（note + sections）
- 読み取り + 書き込みのセット
  - データの存在確認後に更新・削除を行う場合

### トランザクション実装パターン

Service層での使用

```ts
// external/service/note/note.service.ts
export class NoteService {
  constructor(
    private noteRepository: INoteRepository,
    private templateRepository: ITemplateRepository,
    private transactionManager: ITransactionManager<DbClient>,
  ) {}

  async createNote(ownerId: string, input: CreateNoteRequest): Promise<Note> {
    return this.transactionManager.execute(async (tx) => {
      const template = await this.templateRepository.findById(input.templateId, tx);
      if (!template) {
        throw new Error("Template not found");
      }

      return this.noteRepository.create({
        title: input.title,
        templateId: input.templateId,
        ownerId,
        sections,
      }, tx);
    });
  }
}
```

#### Repository層での対応

```ts
// external/repository/note.repository.ts
export class NoteRepository implements INoteRepository {
  async create(data: CreateNoteData, client: DbClient = db): Promise<Note> {
    const noteId = crypto.randomUUID();

    // Create note
    await client.insert(notes).values({
      id: noteId,
      title: data.title,
      // ...
    });

    // Create sections (同じトランザクション内)
    if (data.sections.length > 0) {
      await client.insert(sections).values(
        data.sections.map(s => ({
          noteId: noteId,
          fieldId: s.fieldId,
          content: s.content,
        }))
      );
    }

    return this.findById(noteId, client);
  }
}
```

### COMMIT/ROLLBACK

Drizzle ORMの`db.transaction()`が自動的に処理します：

- 自動COMMIT: コールバック関数が正常に完了したら自動的にCOMMIT
- 自動ROLLBACK: コールバック関数内でエラーがthrowされたら自動的にROLLBACK

```ts
async execute<T>(callback: (tx: DbClient) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    return await callback(tx);
  });
}
```

### トランザクション不要な操作

- 読み取り専用のクエリ
- 単一テーブルへの単純な操作
- 集約でない単一エンティティ（例: Accountなど）

### 実装例まとめ

| ユースケース | トランザクション使用 | 理由 |
| --- | --- | --- |
| Template作成 | ✅ 必要 | template + fields の作成 |
| Note作成 | ✅ 必要 | template取得 + note + sections の作成 |
| Note一覧取得 | ❌ 不要 | 読み取りのみ |
| Account取得 | ❌ 不要 | 単一エンティティの読み取り |

## デバッグテクニック

Server Componentsのデバッグ

```tsx
// コンソール出力はサーバー側に表示
export default async function Page() {
  console.log('This logs on the server')

  const data = await fetchData()
  console.log('Fetched data:', data)

  return <div>...</div>
}
```

Client Componentsのデバッグ

```tsx
'use client'

export function Component() {
  // ブラウザコンソールに表示
  console.log('This logs in the browser')

  // React Developer Tools で確認可能
  return <div>...</div>
}
```
