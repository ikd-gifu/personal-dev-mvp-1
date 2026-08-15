# Features ディレクトリ設計

## 概要

Featuresディレクトリは、アプリケーションの機能を**ドメイン単位**で整理します。各機能は独立したモジュールとして設計され、高い凝集性と低い結合性を保ちます。

## ディレクトリ構造

```
features/
├─ note/         # ノート機能
├─ template/     # テンプレート機能
├─ auth/         # 認証機能
└─ account/      # アカウント機能
```

## 機能モジュールの内部構造

```
features/note/
├─ components/
│  ├─ server/    # Server Components（ページテンプレート）
│  │  └─ NoteDetailPageTemplate/      # 他: NoteListPageTemplate, NoteEditPageTemplate, NoteNewPageTemplate, My*系も同型
│  │     ├─ index.ts
│  │     └─ NoteDetailPageTemplate.tsx
│  └─ client/    # Client Components（Container/Presenter）
│     ├─ NoteList/
│     │  ├─ index.ts
│     │  ├─ NoteListContainer.tsx
│     │  ├─ NoteListPresenter.tsx
│     │  └─ useNoteList.ts            # mutationも含めロジックはここに集約（別ファイルに切り出さない）
│     └─ NoteEditForm/                # フォーム系のみschema.ts・Skeletonが追加される
│        ├─ index.ts
│        ├─ NoteEditFormContainer.tsx
│        ├─ NoteEditFormPresenter.tsx
│        ├─ NoteEditFormSkeleton.tsx
│        ├─ schema.ts
│        └─ useNoteEditForm.ts
├─ constants/
│  └─ index.ts   # NOTE_STATUSなどのドメイン定数
├─ hooks/        # 読み取り専用のTanStack Queryフック
│  └─ useNoteListQuery.ts
├─ queries/
│  └─ keys.ts    # QueryKey定義のみ
└─ types/
   └─ index.ts
```

フォーム系コンポーネントのみ`Skeleton`を持つ理由: 送信中・初期データ取得中に最終レイアウトに近いプレースホルダー（skeleton screen）を表示し、レイアウトシフトを防ぎながら読み込み中であることを示すため。一覧・詳細系（`NoteList`など）は`isLoading`をPresenter側で分岐すれば足りるため、専用のSkeletonコンポーネントは持たない。

## Container/Presenterパターン

### Container (ロジック層)

Containerの責務:

- カスタムフックを使ってデータを取得する
- イベントハンドラーを定義する
- Presenterコンポーネントをレンダリングしてpropsを渡す
- DOM要素（div、button、linkなど）を直接レンダリングしない

```tsx
export function NoteListContainer({ initialFilters }: NoteListContainerProps) {
  const {
    notes,
    isLoading,
    filters,
    updateFilters,
    handleDelete,
  } = useNoteList(initialFilters)

  return (
    <NoteListPresenter
      notes={notes}
      isLoading={isLoading}
      filters={filters}
      onFilterChange={updateFilters}
      onDelete={handleDelete}
    />
  )
}
```

### Presenter (表示層)

Presenterはデータ取得・ビジネスロジックに関わる状態・副作用を持たない。ただしドロップダウンの開閉など表示にのみ関わる軽量なUI状態（`useState`）は許容する。

```tsx
export function NoteListPresenter({
  notes,
  isLoading,
  filters,
  onFilterChange,
  onDelete,
}: NoteListPresenterProps) {
  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} onChange={onFilterChange} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} onDelete={() => onDelete(note.id)} />
        ))}
      </div>
    </div>
  )
}
```

## Server Componentsテンプレート

Server Components は専用のディレクトリを作成し、index.tsでエクスポートを管理します。

```tsx
export async function NoteListPageTemplate({ searchParams }: NoteListPageTemplateProps) {
  const queryClient = getQueryClient()
  const filters = {
    status: searchParams.status as NoteStatus,
    q: searchParams.q as string
  }

  await queryClient.prefetchQuery({
    queryKey: noteKeys.list(filters),
    queryFn: () => listNotesServer(filters),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <NoteListContainer initialFilters={filters} />
    </HydrationBoundary>
  )
}
```

## ベストプラクティス

1. **Server/Client境界**: Page TemplateはServer Component、Container以下はClient Component（判断基準は[02_architecture.md](./02_architecture.md)の「Server Components優先」原則に従う）
2. **分割の基準**: データ取得・副作用・イベントハンドラを持つコンポーネントのみContainer+Presenterに分割する。状態を持たない純粋な表示コンポーネントはContainerを作らず単一コンポーネントのままにする
3. **Presenterの許容範囲**: Presenterはデータ取得・ビジネスロジックを持たない。ただしドロップダウンの開閉など表示にのみ関わる軽量なUI状態（`useState`）は許容する。データやビジネスロジックに関わる状態・副作用はContainer + Custom Hookに集約する
4. **ロジックの配置**: Container + Custom Hookにロジックを集約する
5. **単一責任の原則**: 各コンポーネントは1つの責任のみを持つ
6. **再利用性**: 汎用的なコンポーネントは`shared/`へ移動する
7. **型安全性**: コンパイル時の型保証はTypeScriptで行い、Server Action/Handler層などプロセス境界を跨ぐ入力はZod等で実行時バリデーションを行う
8. **テスタビリティ**: Presenterはpropsのみに依存する形にし、単体テスト可能な設計を保つ。テストランナー（例: Vitest等）と「最低限どのレイヤーを実際にテストするか」は[07_development_guide.md](./07_development_guide.md)作成時に別途決定する
9. **最低限の配置・命名ルール**: ファイル名とコンポーネント名を一致させる。1ファイルに複数のコンポーネントを定義しない
