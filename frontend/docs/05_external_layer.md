# External Layer (外部連携層)

## 概要

External層は、アプリケーションと外部システムとの境界を管理します。将来的にバックエンドをGoなどの別のAPIサーバーに移行することを見据え、現在（MVP）はNext.js側にDomain層・Repository層を持ちDBに直結していますが、移行後はDomain層（ビジネスルール）とRepository層（永続化）をまるごとバックエンドAPI側に移管し、Next.js側は「生成APIクライアントを呼び、DTOに整形するだけの薄い層」に縮退します。

## 設計思想

- **変更可用性**: バックエンドの実体（DB直結 / 外部API）が変わっても、Handler層（CQRSのエントリーポイント）とその先のClient Component/Featureは変更不要にする
- **関心の分離**: MVP段階では「ビジネスロジック」と「永続化」をDomain/Repositoryとして分離しておくことで、移行時にそのまま丸ごとバックエンドへ持ち出しやすくする
- **型安全性**: MVP段階はZod DTOで、移行後はOpenAPI生成型で入出力を保証する

## ディレクトリ構造

### MVP（現在）

```
external/
├─ domain/       # エンティティ・ビジネスルール・Repositoryインターフェース（→将来バックエンドへ移管）
├─ dto/          # データ転送オブジェクト（Handler層の入出力契約）
├─ handler/      # エントリーポイント（CQRSパターン: *.query.* / *.command.*）
├─ service/      # ビジネスロジック（Repositoryインターフェース経由でDB操作）
├─ repository/   # Repositoryの実装（Drizzle経由、→将来バックエンドへ移管）
└─ client/
   └─ database/  # DB接続クライアント（Drizzle + pg、→将来バックエンドへ移管）
```

### 移行後

```
external/
├─ dto/          # データ転送オブジェクト、または生成APIの型をそのまま使用
├─ handler/      # エントリーポイント（変更なし）
├─ service/      # 薄いラッパー。生成APIクライアントを呼びDTOに変換するだけ
└─ client/
   └─ api/
      ├─ config.ts               # APIクライアントの設定（baseURLなど）
      └─ generated/apis/         # OpenAPIなどから自動生成されたAPIクライアント

# domain/・repository/・client/database/ は消滅し、バックエンドAPIサーバー側に移管される
```

## レイヤーの責務

### Domain・Repository（MVPのみ・移行時にバックエンドへ移管）

`domain-service.ts`のような「Draftは公開できるか」といったビジネスルールと、`INoteRepository`実装によるDB操作は、MVP段階ではNext.js側に置くが、移行時はそのままバックエンドAPIサーバーの実装として持ち出す。Next.js側からは完全に削除される。

### Service（MVP → 移行後 で実装が全面的に変わる）

MVP:

```ts
export class NoteService {
  constructor(private noteRepository: INoteRepository) {}

  async getNoteById(id: string): Promise<Note | null> {
    return this.noteRepository.findById(id);
  }
}
```

移行後:

```ts
export class NoteService {
  constructor(private readonly api: NotesApi) {}

  async getNoteById(id: string): Promise<NoteResponse | null> {
    try {
      const note = await this.api.notesGetNoteById({ noteId: id });
      return toNoteResponse(note);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }
}
```

Serviceの公開メソッド名（`getNoteById`など）は維持しつつ、内部実装・依存先・戻り値の型（Noteエンティティ→NoteResponse DTO）が全面的に変わる。

### Handler（一部書き換えが必要）

MVPのHandlerは、ServiceからNoteエンティティを受け取り、template/ownerを個別取得して`toNoteResponse(note, template, owner)`で合成していた。移行後はServiceが既に完成した`NoteResponse`を返すため、この合成ロジックは不要になり、Handlerはシンプルにパススルーする形に書き換わる。

```ts
// 移行後のHandlerイメージ
export async function getNoteByIdQuery(request: GetNoteByIdRequest) {
  const validated = GetNoteByIdRequestSchema.parse(request);
  return noteService.getNoteById(validated.id); // すでにNoteResponse
}
```

## データフロー

### MVP（現在）

```
Client Component → Action → Handler → Service → Repository → Database
```

### 移行後

```
Client Component → Action → Handler(簡略化) → Service(薄いラッパー) → 生成APIクライアント → バックエンドAPI（Domain/Repositoryを内包）
```

## 移行戦略

1. バックエンドAPIサーバー側に、Next.jsの`domain/`・`repository/`にあるビジネスルールとDB操作をそのまま移植する
2. OpenAPI仕様等からAPIクライアントを生成し、`external/client/api/`に配置する
3. `service/`配下の各Serviceクラスを、Repositoryではなく生成APIクライアントに依存する形に書き換える（Domain→DTOの変換責務もServiceに集約する）
4. Handler層の、Serviceの戻り値をさらに加工していた箇所（template/owner合成など）を削除・簡略化する
5. `domain/`・`repository/`・`client/database/`をNext.js側から削除する

## ベストプラクティス

- **MVP段階からDomain/Repositoryを分離しておく**: ビジネスルールを`domain-service.ts`のような関数群に、DB操作を`I*Repository`実装に分離しておくことで、移行時にバックエンドへそのまま移植しやすくなる
- **HandlerはServiceの戻り値を信頼する**: 移行後Serviceが完成済みDTOを返す設計にするなら、Handlerで再度加工しない
- **Serviceの公開メソッドのシグネチャを設計の軸にする**: 内部実装（Repository経由かAPIクライアント経由か）が変わっても、Handlerが呼び出すメソッド名・引数は変えない方針にする
