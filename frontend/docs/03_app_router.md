# App Router 設計ガイド

## 基本方針

- `page.tsx`と`layout.tsx`は全てRSC (React Server Component)
- `error.tsx`のみClient Component
- ビジネスロジックは`features/`に委譲
- ルート構造で認証状態を表現
- Next.js 15+のグローバル型定義（`LayoutProps`/`PageProps`）を活用

## ルートグループ戦略

### 認証別グループ

```
app/
├─ (guest)/          # 未ログインユーザー向け
│  ├─ login/
│  └─ signup/
└─ (authenticated)/  # ログイン必須
   ├─ notes/
   ├─ templates/
   └─ me/
```

### グループ別設定

| グループ | Layout | 認証チェック | 共通UI |
|---------|--------|------------|---------|
| `(guest)` | シンプル | リダイレクト | なし |
| `(authenticated)` | フル機能 | 必須 | Header, Sidebar |

## ページコンポーネントパターン

### 基本構造

```tsx
// app/(authenticated)/notes/[id]/page.tsx
import { NoteDetailPageTemplate } from "@/features/note/components/server/NoteDetailPageTemplate";

export default async function NoteDetailPage({
  params,
}: PageProps<"/notes/[id]">) {
  const { id } = await params;
  return <NoteDetailPageTemplate noteId={id} />;
}
```

### メタデータ設定

```tsx
// app/(authenticated)/notes/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ノート一覧 | Mini Notion",
  description: "設計メモを構造化して残すミニノートアプリ",
};

export default function NotesLayout({ children }: LayoutProps<"/notes">) {
  return <>{children}</>;
}
```

## 認証レイアウト実装

```tsx
// app/(authenticated)/layout.tsx
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/features/auth/lib/better-auth'
import { AuthenticatedLayoutWrapper } from '@/shared/components/layout/server/AuthenticatedLayoutWrapper'

export default async function AuthenticatedPageLayout({
  children,
}: LayoutProps<'/'>) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.account) {
    redirect('/login')
  }

  return <AuthenticatedLayoutWrapper>{children}</AuthenticatedLayoutWrapper>
}
```

## エラーハンドリング

```tsx
// app/(authenticated)/notes/error.tsx
'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

## ローディング状態

```tsx
// app/(authenticated)/notes/loading.tsx
export default function Loading() {
  // 任意のUI（スケルトンなど）を配置できる
  return <NoteListSkeleton />
}
```
