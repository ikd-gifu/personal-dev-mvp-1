## API構成

### エンドポイント分類

- Query（読み取り）：データ取得のみ。副作用なし（GET）
- Command（書き込み）：データの作成・更新・削除。副作用あり（PUT POST DELETE）

### URL設計とHTTPメソッド

| 操作 | HTTPメソッド | URLパターン | 用途 |
| --- | --- | --- | --- |
| 一覧取得 | GET | /api/xxx | リソース一覧（パラメータで絞り込む） |
| 単体取得 | GET | /api/xxx/:id | IDで1件取得 |
| 更新 | PUT | /api/xxx/:id | 既存更新 |
| 作成 | POST | /api/xxx | 新規作成 |
| 削除 | DELETE | /api/xxx/:id | 削除 |
| 状態変更 | POST | /api/xxx/:id/action | 状態遷移 /api/notes/:id/publish |

## Notes（ノート）API

### Query Operations

ノート一覧取得

URL: GET /api/notes

#### Request (Query Parameters):

```jsx
NoteFilters {
	q?: string                   // タイトル検索
	status?: "Draft" | "Publish"
	templateId?: string          // ノートで利用しているテンプレート
	ownerId?: string             // マイノート一覧
}
```

#### Response:

```jsx
NoteResponse {
	id: string
	title: string
	templateId: string
	ownerId: string
	  owner: {
    id: string
    firstName: string
    lastName: string
    thumbnail?: string
  }
	status: "Draft" | "Publish"
  sections: [{
    id: string
    fieldId: string
    fieldLabel: string
    content: string
    isRequired: boolean
  }]
	createdAt: string   // ISO 8601形式
	updatedAt: string   // ISO 8601形式
}

// 一覧表示用に別名
ListNoteResponse = NoteResponse[]
```

#### ビジネスルール:

- 認証必須
- 公開済み（Publish）あるいは自分のノートは下書きも取得
- ownerIdを指定した場合、そのユーザーが所有するノートのみを取得
- 自分のノートのみを取得する場合: GET /api/notes?ownerId={自分のID}

ノート詳細取得

URL: GET /api/notes/:id

#### Request (URL Parameters):

```jsx
id: string   // ノートID 型を明示
```

#### Response:

```jsx
GetNoteByIdResponse = NoteResponse | null;  // 見つからない場合はnull
```

#### ビジネスルール:

- 認証必須
- 見つからない場合、nullを返す

### Command Operations

ノート作成

URL: POST /api/notes

#### Request:

```jsx
// ユーザーが新規作成画面で入力する必要があるパラメータのみ指定
CreateNoteRequest {
	title: string
	templateId: string
  sections?: [{
    fieldId: string
    content: string
  }
}
```

#### Response:

```jsx
CreateNoteResponse = NoteResponse;
```

#### ビジネスルール:

- 認証必須
- 新規作成時のステータスは"Draft"
- 指定されたテンプレートが存在する必要がある
- sectionsが未指定の場合、テンプレートのフィールドから空のセクションを自動生成

ノート更新

URL: PUT /api/notes/:id

#### Request:

```jsx
EditNoteRequest {
	id: string           // ノートのID
	title: string
	templateId: string
  sections: [{
	  id: string         // セクションID
    content: string
  }]
}
```

#### Response:

```jsx
EditNoteResponse = NoteResponse;
```

#### ビジネスルール:

- 認証必須
- ノートの所有者のみ更新可能
- テンプレートのフィールド構造は変更不可（fieldIdは不要）

ノート削除

URL: DELETE /api/notes/:id

#### Request:

```jsx
DeleteNoteRequest {
  id: string         // ノートID
}
```

#### Response:

```jsx
DeleteNoteResponse {    // 削除成功のみ返す
  success: boolean
}

```

#### ビジネスルール:

- 認証必須
- ノートの所有者のみ削除可能
- ノートに紐づくセクションも同時に削除される

ノート公開

URL: POST /api/notes/:id/publish

#### Request:

```jsx
PublishNoteRequest {   // statusはURLで指定し状態変更する設計
	noteId: string       // idはpathに指定されている
}
```

#### Response:

```jsx
PublishNoteResponse = NoteResponse;   // 最新のノートの状態を返す
```

#### ビジネスルール:

- 認証必須
- 本人のノートのみ公開可能
- 下書き（Draft）から公開済み（Publish）に状態遷移
- 既に公開済みの場合はエラー

ノート非公開

URL: POST /api/notes/:id/unpublish

#### Request:

```jsx
UnpublishNoteRequest {
	noteId: string
}
```

#### Response:

```jsx
UnpublishNoteResponse = NoteResponse;
```

#### ビジネスルール:

- 認証必須
- ノートの所有者のみ許可
- 公開（Publish）から非公開（Draft）に状態遷移
- 既に下書きの場合はエラー

## Templates（テンプレート）API

### Query Operations

テンプレート一覧取得

URL: GET /api/templates

#### Request (Query Parameters):

```jsx
// 再利用しない、単純な条件なので型定義しない
q?: string         // テンプレート名のキーワード検索
ownerId?: string   // 所有者ID
```

#### Response:

```jsx
TemplateResponse {
	id: string
	name: string
	ownerId: string
	owner: {
    id: string
    firstName: string
    lastName: string
    thumbnail?: string
	}
	fields: [{
    id: string
    label: string
    order: number
    isRequired: boolean
	}]
	updatedAt: string  // ISO 8601形式
  isUsed: boolean    // ノートで使用中かどうか
}

TemplateListResponse = TemplateResponse[];
```

#### ビジネスルール:

- 認証必須
- ownerIdを指定するとそのユーザーのテンプレートのみ表示
- 自分のテンプレートのみを取得する場合: GET /api/templates?ownerId={自分のID}
- isUsedは、テンプレートがノートで使用中かを示す

テンプレート詳細取得

URL: GET /api/templates/:id

#### Request (URL Parameter):

```jsx
// 単純、再利用しないので型定義しない
id: string  // テンプレートID
```

#### Response:

```jsx
GetTemplateByIdResponse = TemplateResponse | null;  // 見つからない場合はnull
```

#### ビジネスルール:

- 認証必須
- 存在しないIDの場合はnullを返す

### Command Operations

テンプレート作成

URL: POST /api/templates

#### Request:

```jsx
CreateTemplateRequest {
	name: string
	fields: [{
    label: string
    order: number
    isRequired: boolean
	}]
}
```

#### Response:

```jsx
CreateTemplateResponse = TemplateResponse;
```

#### ビジネスルール:

- 認証必須
- フィールドのorderは0から始まる連番
- 新規作成時のisUsedはfalse

テンプレート更新

URL: PUT /api/templates/:id

#### Request:

```jsx
EditTemplateRequest {
	id: string.        // テンプレートID
	name: string
	fields: [{
		id?: string      // 既存fieldでは必須
    label: string
    order: number
    isRequired: boolean
	}]
}
```

#### Response:

```jsx
EditTemplateResponse = TemplateResponse;
```

#### ビジネスルール:

- 認証必須
- 自分が所有するテンプレートのみ更新可能
- テンプレートがノートで使用中（isUsed = true）の場合:
    - （↓ドメインから読み取り設計）
    - テンプレート名の変更: 可能
    - フィールドのlabel変更: 可能
    - フィールドのisRequired変更: 可能
    - フィールドの追加: 不可
    - フィールドの削除: 不可
    - フィールドのorder変更: 不可
- テンプレートが未使用（isUsed = false）の場合:
    - すべての変更が可能

テンプレート削除

URL: DELETE /api/templates/:id

#### Request:

```jsx
DeleteTemplateRequest {
  id: string  // テンプレートID
}
```

#### Response:

```jsx
DeleteTemplateResponse {
  success: boolean
}
```

ビジネスルール:

- 認証必須
- 所有者のみ削除可能
- ノートで使用中（isUsed = true）のものは削除不可
- 削除すると紐づくフィールドも同時に削除する

## Accounts（アカウント）API

OAuth連携時のアカウント作成または取得

ユーザー新規登録

URL: POST /api/accounts/auth (内部処理)

#### Request (Query Parameters):

```jsx
CreateOrGetAccountRequest {
	email: string
	name: string
	provider: string          // "google"など
	providerAccountId: string
	thumbnail?: string
}
```

#### Response:

```jsx
AccountResponse {
	id: string
	email: string
	firstName: string
	lastName: string
  fullName: string
  thumbnail?: string
  lastLoginAt: string  // ISO 8601形式
  createdAt: string    // ISO 8601形式
  updatedAt: string    // ISO 8601形式
}
```

#### ビジネスルール:

- 既存アカウントが存在する場合は取得、存在しない場合は新規作成
- プロバイダーからnameの形で連携されるので分割する

現在のアカウント取得

URL GET /api/accounts/me

#### Request:

```jsx
なし
```

#### Response:

```jsx
GetCurrentAccountResponse = AccountResponse;
```

#### ビジネスルール:

- 認証必須
- ログインユーザーのアカウント情報をプロバイダーから取得

アカウント詳細取得

URL: GET /api/accounts/:id

#### Request (Query Parameters):

```jsx
id: string  // アカウントID
```

#### Response:

```jsx
GetAccountByIdResponse = AccountResponse | null;  // 見つからない場合はnull
```

#### ビジネスルール:

- 認証必須
- 存在しない場合はnullをかえす

## ドメインモデルの関係

#### エンティティの関連

```jsx
Accounts 
     |
     +--- Templates 
     |       |
     |       +--- Fields
     |
     +------- Notes
                 |
                 +--- Sections
```

#### 関係性の説明

- Account: システムのユーザー
- Template: ノートの構造を定義する
    - 1つのTemplateは複数のFieldを持つ
    - 1つのAccountは複数のTemplateを持つことが可能
- Field: Templateの項目を定義
    - label（ラベル）、order（順序）、isRequired（必須フラグ）を持つ
- Note: ユーザーが作成するノート
    - 1つのTemplateから作成される
    - 1つのAccountが持つ
    - 1つのNoteは複数のSectionを持つ
- Section: Noteの各項目の内容
    - TemplateのFieldと対応する
    - コンテンツを保持

## 認証・認可の方針

#### 認証方式

- OAuth 2.0を利用する
- すべてのAPIは認証必須とする（新規登録・ログインの入口は除く）

#### 認可（権限チェック）

1.Ownerチェック

- 本人のみリソースの操作を許可
- 対象
    - ノート：更新、削除、公開、非公開
    - テンプレート：更新・削除

2.ステータスベースの制御

ノート

- 公開（Publish）：すべてのユーザーが閲覧できる
- 下書き（Draft）：本人のみ閲覧できる

テンプレート

- 利用中（isUsed = true）：フィールド構造の変更は不可
- 未使用（isUsed = false）：すべての変更が可能

#### 権限チェックの考え方

| 操作 | 認証 | Owner判定 | その他 |
| --- | --- | --- | --- |
| ノート一覧取得 | 必須 | 不要（ownerIdでフィルタ） | 公開済みまたは自分のノート |
| ノート詳細取得 | 必須 | 不要 | 公開済みまたは自分のノート |
| ノート作成 | 必須 | 自動設定 | - |
| ノート更新 | 必須 | 必須 | - |
| ノート公開 | 必須 | 必須 | Draft状態のみ |
| ノート公開取り消し | 必須 | 必須 | Publish状態のみ |
| ノート削除 | 必須 | 必須 | - |
| テンプレート一覧取得 | 必須 | 不要（ownerIdでフィルタ） | - |
| テンプレート詳細取得 | 必須 | 不要 | - |
| テンプレート作成 | 必須 | 自動設定 | - |
| テンプレート更新 | 必須 | 必須 | 使用中の場合は制限あり |
| テンプレート削除 | 必須 | 必須 | 未使用のみ |

## 型定義の補足

#### 共通型

```jsx
// ノートの公開状態
NoteStatus = "Draft" | "Publish";

// 日付形式
ISODateString = string;  // ISO 8601形式（例: "2026-04-13T09:00:00Z"）

```

#### バリデーションルール（概念）

- **title**: 1文字以上の文字列（ノートの名称）
- **name**: 1文字以上の文字列（テンプレートの名称）
- **label**: 1文字以上の文字列（テンプレートの項目名称：課題など）
- **content**: 0文字以上の文字列（空文字可）
- **order**: 0以上の整数
- **isRequired**: boolean
- **isUsed**: boolean
- **id**: UUID v4形式の文字列