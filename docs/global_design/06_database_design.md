# **テーブルとカラム**

### accounts（ユーザー）

| カラム | データ型 | 説明 |
| --- | --- | --- |
| id | UUID | PK：ユーザーID |
| email | text | UK：account毎に一意（@必須・VOで制御） |
| first_name | text | 名前（必須） |
| last_name | text | 苗字（必須） |
| is_active | boolean | アカウント状況（default: true） |
| provider | text | 認証プロバイダー |
| provider_account_id | text | プロバイダー側のID |
| thumbnail | text | サムネイルのURL（null許可） |
| last_login_at | timestamptz | 最終ログイン時刻（null許可） |
| created_at | timestamptz | 登録日時 |
| updated_at | timestamptz | 更新時刻 |

制約:

- UNIQUE(email)
- UNIQUE(provider, provider_account_id)

### templates（テンプレート）

| カラム | データ型 | 説明 |
| --- | --- | --- |
| id | UUID | PK：テンプレID |
| name | text | テンプレートの名称 |
| owner_id | UUID | FK：紐づくaccounts.idを指定 |
| updated_at | timestamptz | 更新時刻 |

関係: accounts 1 < templates

### fields（テンプレの項目）

| カラム | データ型 | 説明 |
| --- | --- | --- |
| id | UUID | PK：フィールドID |
| template_id | UUID | FK：所属するテンプレート。templates.id |
| label | text | 項目名（必須） |
| order | int | 並び順（テンプレ内で一意） |
| is_required | boolean | 必須指定（必須：true） |

制約

- UNIQUE(template_id, order)
- CHECK(order > 0) （順序は自然数）

関係: templates 1 < fields

### notes（ノート）

| カラム | データ型 | 説明 |
| --- | --- | --- |
| id | UUID | PK：ノートID |
| title | text | ノートのタイトル（必須） |
| template_id | UUID | FK：使用するテンプレートID。templates.id |
| owner_id | UUID | FK：作成したユーザー。accounts.id |
| status | text | Draft / Publish VOを用いてアプリ側で制御する。DBはTEXT形式のみ設定 |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新時刻 |

Indexes:

- INDEX(owner_id)　（マイノート一覧）
- INDEX(template_id)　（利用中のテンプレートは削除不可）
- INDEX(updated_at DESC)　（直近で変更があったノートから表示）

関係:

templates 1 —< notes

accounts 1 —< notes

### sections（ノートのセクション）

| カラム | データ型 | 説明 |
| --- | --- | --- |
| id | UUID | PK：セクションID |
| note_id | UUID | FK：親ノートのID
notes.id |
| field_id | UUID | FK：参照するテンプレートの項目
fields.id |
| content | text | ユーザーが入力した内容
文字列のみ |

制約

- UNIQUE(note_id, field_id)　（1つのNoteに対して、同じ項目の重複を防ぐ）
- 必須項目チェックはアプリケーション層で実施（ドメインルールとして fields.is_required を参照）
  - MVPではフォームバリデーションのみ

関係：

- notes 1 ─< sections
- sections → fields（多→1参照）（テンプレのフィールドは複数ノートから参照される）

索引：

- INDEX(note_id)　（ノート詳細、編集）
- INDEX(field_id)　（テンプレートに設定したlabelを取得（JOIN）してノートに表示）

# ERダイアグラム

```jsx
accounts (ユーザー)
 ├─< templates (テンプレート)
 │    └─< fields (テンプレートの項目)
 └─< notes (ノート)
      └─< sections (ノート内の項目内容)
           └─→ fields (対応するテンプレート項目を参照（多対1参照）)
```

# 集約とトランザクション境界

## 集約境界の定義

## Note集約

```jsx
notes（集約ルート）
  └--< section（集約メンバー）
  └-→templates（外部集約への参照）
```

notesとsectionsはまとめて扱う

sectionsの操作はnotesを通じて行う

templatesは参照のみ

トランザクション境界はNote集約

## Template集約

```jsx
templates（集約ルート）
  └--< fields（集約メンバー）
```

templatesとfieldsはまとめて扱う

fieldsの操作はtemplatesを通じて行う

トランザクション境界はTemplates集約

## トランザクション制御のルール

## 同一集約内の操作

### Template集約の操作

1.テンプレート作成

2.フィールド追加（同じ集約）

上記操作は1トランザクション内で実行し、整合性を保証

### Note集約の操作

1.ノート作成

2.セクション追加（同じ集約内）

上記操作は1トランザクション内で実行し、整合性を保証

## 集約をまたぐ操作（別トランザクション）

集約ごとにトランザクションを分ける

Template集約の操作（トランザクション１）

Note集約の操作（トランザクション２、Templateは参照のみ）

## 集約境界設計の原則

1.集約内の整合性

- 集約ルートを通してのみ更新
- メンバーを直接更新しない

2.集約間の結合度

- 他の集約への参照はIDのみ
- 集約を跨ぐ操作はService層で調整

3.トランザクション＝集約

- １トランザクション
- 複数集約にまたがる整合性はアプリケーション層で保証

4.集約のライフサイクル（ON DELETE CASCADE）

動作：

- 集約ルートと同時にメンバーも削除される
- Template削除時　Fieldsも削除（ON DELETE CASCADE）
- Note削除時　Sectionsも自動削除（ON DELETE CASCADE）
- Fields削除時：
CASCADEなし
Sectionが存在する場合は削除不可（アプリケーション層でチェック）

集約の境界：

- templates ⇄ fields：同じ集約（親子、CASCADE）
- notes ⇄ sections：同じ集約（親子、CASCADE）
- sections → fields：集約を跨ぐ参照（CASCADEなし）

## ON DELETE CASCADEの使い分け

| 関係 | CASCADE設定 | 理由 |
| --- | --- | --- |
| `templates` → `fields` | あり | 同一集約。テンプレートを削除したらフィールドも削除 |
| `notes` → `sections` | あり | 同一集約。ノートを削除したらセクションも削除 |
| `sections` → `fields` | なし | 集約を跨ぐ参照。フィールド削除時はセクションを自動削除しない。（参照整合性のみ） |
| `notes` → `templates` | なし | 集約を跨ぐ参照。
テンプレート削除時：
CASCADEしない
使用中のテンプレートは削除不可
（ビジネスルール） |
| `accounts` → `templates` | なし | 集約を跨ぐ参照。必要時はアプリケーション層で明示的に制御（未定義） |
| `accounts` → `notes` | なし | 集約を跨ぐ参照。必要時はアプリケーション層で明示的に制御（未定義） |

原則：

- 同一集約内の親子関係：ON DELETE CASCADE を使用
- 集約を跨ぐ参照：CASCADE なし（アプリケーション層で制御）
