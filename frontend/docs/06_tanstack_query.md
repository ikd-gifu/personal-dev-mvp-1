# TanStack Query 実装ガイド

## 概要

TanStack Queryを使用してサーバー状態を管理し、Next.js App RouterのServer Componentsと連携させます。

> **注意**: 本ドキュメントのコード例はTanStack Query公式ドキュメントの実装パターンに準拠したものであり、関数名・シグネチャは実際の`external/handler/`配下の実装と一致しない場合がある（例: `getNoteByIdQuery`は実際には`(request, viewerId)`の2引数を取る）。実装時は各層の関数名・シグネチャは実装済みのコードを正とし、ここではQuery/Mutationの設計パターンのみを参照すること。

## セットアップ

### QueryClient生成（サーバー/ブラウザ両対応）

```ts
// shared/lib/query-client.ts
import { QueryClient } from "@tanstack/react-query";

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0, // RSCのhydrateデータを常に優先
        gcTime: 5 * 60 * 1000, // 5分（デフォルト）
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

let browserQueryClient: QueryClient | undefined;

export const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: 常に新しいQueryClientを作る
    return createQueryClient();
  }
  // Browser: シングルトンとして使い回す
  if (!browserQueryClient) {
    browserQueryClient = createQueryClient();
  }
  return browserQueryClient;
};
```

### Provider

```tsx
// shared/providers/QueryProvider/QueryProvider.tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { getQueryClient } from "@/shared/lib/query-client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

### クエリキーの管理

```ts
// features/note/queries/keys.ts
export const noteKeys = {
  all: ["notes"] as const,
  lists: () => [...noteKeys.all, "list"] as const,
  list: (filters: NoteFilters) => [...noteKeys.lists(), filters] as const,
  myLists: () => [...noteKeys.all, "myList"] as const,
  myList: (filters: NoteFilters) => [...noteKeys.myLists(), filters] as const,
  details: () => [...noteKeys.all, "detail"] as const,
  detail: (id: string) => [...noteKeys.details(), id] as const,
};
```

### サーバーサイドプリフェッチ

```tsx
// features/note/components/server/NoteDetailPageTemplate/NoteDetailPageTemplate.tsx
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getNoteByIdQuery } from "@/external/handler/note/note.query.server";
import { NoteDetail } from "@/features/note/components/client/NoteDetail";
import { noteKeys } from "@/features/note/queries/keys";
import { getQueryClient } from "@/shared/lib/query-client";

export async function NoteDetailPageTemplate({ noteId }: { noteId: string }) {
  const note = await getNoteByIdQuery({ id: noteId });

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: noteKeys.detail(noteId),
    queryFn: () => note,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <NoteDetail noteId={noteId} />
    </HydrationBoundary>
  );
}
```

※ Handler層の関数を直接awaitで呼んでからprefetchQueryに結果を渡す形（`queryFn: () => note`）で、Server Action経由ではない点に注意。

## クライアントサイドQuery

Server Action（`*.query.action.ts`）をqueryFnに直接渡す。

```ts
// features/note/hooks/useNoteDetailQuery.ts
import { useQuery } from "@tanstack/react-query";
import { getNoteByIdQueryAction } from "@/external/handler/note/note.query.action";
import { noteKeys } from "@/features/note/queries/keys";

export function useNoteDetailQuery(noteId: string) {
  return useQuery({
    queryKey: noteKeys.detail(noteId),
    queryFn: () => getNoteByIdQueryAction({ id: noteId }),
  });
}
```

```ts
// features/note/hooks/useNoteListQuery.ts
import { useQuery } from "@tanstack/react-query";
import { listNoteQueryAction } from "@/external/handler/note/note.query.action";
import { noteKeys } from "@/features/note/queries/keys";
import type { NoteFilters } from "@/features/note/types";

export function useNoteListQuery(filters: NoteFilters) {
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn: () => listNoteQueryAction(filters),
  });
}
```

## Mutation実装

`onSuccess`でtoast表示・キャッシュ更新・画面遷移を行う、非楽観的な実装。

```ts
// features/note/components/client/NoteDetail/useNoteDetail.ts（抜粋）
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteNoteCommandAction, publishNoteCommandAction } from "@/external/handler/note/note.command.action";
import { noteKeys } from "@/features/note/queries/keys";

const deleteMutation = useMutation({
  mutationFn: () => deleteNoteCommandAction({ id: noteId }),
  onSuccess: () => {
    toast.success("ノートを削除しました");
    queryClient.invalidateQueries({ queryKey: noteKeys.lists() });
    router.push(backTo ?? "/notes");
  },
  onError: () => {
    toast.error("ノートの削除に失敗しました");
  },
});

const publishMutation = useMutation({
  mutationFn: () => publishNoteCommandAction({ noteId }),
  onSuccess: (updatedNote) => {
    toast.success("ノートを公開しました");
    queryClient.setQueryData(noteKeys.detail(noteId), updatedNote); // 即時反映
    queryClient.invalidateQueries({ queryKey: noteKeys.lists() });  // 一覧側は再取得
  },
  onError: () => {
    toast.error("ノートの公開に失敗しました");
  },
});
```
