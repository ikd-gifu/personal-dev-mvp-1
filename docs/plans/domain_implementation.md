# Domain実装計画(引き継ぎメモ)

このファイルは作業単位の一時的な引き継ぎ資料であり、`docs/global_design/`の設計書と同格には扱わない。作業完了後は削除してよい。

## 目的

`frontend/src/external/domain`配下にDDDスタイルのドメイン層を実装する。Account集約・Template集約はすでに実装済み。Note集約を次のセッションで引き継いで実装するための資料。

## 実装パターンについて

クラス設計(private constructor + static create)、値オブジェクトの不変性、trimの位置、例外(`throw new Error`)による不正値表現、id生成の責務分担など、コーディングの具体的なパターンはすべて

**`frontend/src/external/domain/account/account.ts` と `frontend/src/external/domain/account/interface.ts` の実装を正とし、これに合わせる**

こと。本書には実装パターンの詳細を書き写さない。

**子エンティティ(集約ルートではないもの)のパターンについて**: Accountの`private constructor + static create`パターンは集約ルート(Account/Template)向け。子エンティティであるFieldは、Template実装セッションでの議論の結果、以下の方針に落ち着いた(`frontend/src/external/domain/template/field.ts`参照)。

- 単体で判定できる制約(Fieldならlabel非空・order正数)は子エンティティ自身のコンストラクタで検証する
- 複数の子をまたぐ制約(Fieldならorder重複)は集約ルート側のコンストラクタで検証する
- 子エンティティは`static create`のような単体ファクトリを持たない。コンストラクタは(private化できないため)技術的には外部から直接`new`できてしまうが、「集約ルートを経由してのみ生成する」は型システムでは強制せず実装規約として扱う(Account/Emailの関係も同様に規約止まり)。trimは呼び出し側(集約ルートの`create`/`edit`)で行う

Note集約のSectionも同じ子エンティティなので、原則としてこのパターンを踏襲する想定(3-C参照)。ただしSectionはcontent検証自体を行わない(05の注記通り)ため、Fieldほど検証ロジックを持たない可能性が高い。

## 1. ディレクトリ構成(最終版)

```
frontend/src/external/domain/
├── shared/
│   └── value-objects.ts        # 実装済み: Email(class)。NoteStatusは未実装(3-A参照)
├── account/                     # 実装済み
│   ├── account.ts
│   └── interface.ts
├── template/                    # 実装済み
│   ├── field.ts                 # Field(子エンティティ)
│   ├── template.ts              # Template(集約ルート)
│   └── interface.ts             # TemplateRepository
├── note/                        # 未実装
│   ├── section.ts               # Section(子エンティティ)
│   ├── note.ts                  # Note(集約ルート)
│   └── interface.ts             # NoteRepository
└── services/                    # 未実装
    └── note-publication-policy.ts   # canPublish / canUnpublish(Account×Noteをまたぐドメインサービス)
```

集約ごとに「エンティティ＋ルール」を1ファイルにまとめ、Repositoryポートのみ`interface.ts`に分離する(Accountと同じ構成)。

## 2. 設計書間の矛盾に対する合意済み解決方針

| # | 論点 | 解決方針 | 該当セクション |
| - | --- | --- | --- |
| 3-1 | firstName/lastNameの必須性(05は「どちらか必須」、06は両方NOT NULL、07は name分割) | 「どちらか必須」をドメインルールとして採用。DBはNOT NULLのまま、値として空文字を許容する運用にする | 05_domain_design.md「ドメインロジック」＞「Accountチーム」／06_database_design.md「accounts」 |
| 3-2 | Field.orderの開始値(06は`CHECK(order > 0)`、07は「0から始まる連番」) | 1始まりを正とする(06を優先) | 06_database_design.md「fields」 |
| 3-3 | 使用中テンプレートの構造変更制限(07の詳細ルール) | ドメイン層では判定しない。NoteRepository経由の使用チェックを含むためアプリケーションサービス層の責務とする | 05_domain_design.md「ドメインロジック」＞「Templateチーム」／07_api_design.md「テンプレート更新」 |
| 3-4 | EditNoteRequestのtemplateId | ドメインの`edit()`はtemplateIdを受け取らない(変更不可のため無視)。API層のリクエスト型には将来のupsert対応のため残す | 05_domain_design.md「ドメインロジック」＞「Noteチーム」／07_api_design.md「ノート更新」 |
| 3-5 | Statusの表記揺れ(05エンティティ表は小文字、05VO表・07は"Draft"/"Publish") | "Draft"/"Publish"(大文字始まり)に統一 | 05_domain_design.md「VO」／07_api_design.md「型定義の補足」 |
| 3-6 | Repositoryインターフェースの置き場所 | 各集約フォルダ直下の`interface.ts`に配置(ドメイン操作のシグネチャ＋Repositoryポート)。実装は`external/repository`配下 | (設計書に明記なし。プロジェクト固有の実装方針) |
| 3-7 | ID採番の責務 | DBでの自動生成を主とする。Repository実装内で採番するケースも将来的にあり得る(変更可能性あり)。ドメインの`create`はidを必須パラメータとして受け取るのみで、生成自体は行わない | (設計書に明記なし。プロジェクト固有の実装方針) |

## 3. 残タスク

### 3-A. shared/value-objects.ts — NoteStatus

- 現状: `type NoteStatus = "Draft" | "Publish"` + `parseNoteStatus()`関数のまま(例外throw)。EmailはVOとしてclass化済みだが、NoteStatusは未着手。
- 要判断: Emailと同様に class化(`private constructor` + `static create`)するか、現状の型+関数のままにするか。Accountの実装パターンに合わせるなら class化が自然だが、ユーザーに確認すること。

### 3-B. template/field.ts, template/template.ts — 実装済み

- Field: 子エンティティ。Field単体で判定できる制約(label非空／order(1始まり)が正の整数)はField自身のコンストラクタで検証する。ただし単体ファクトリ(create)は持たせない(Templateからのみ`new Field(...)`で生成する。子は親を通してしか触れないため、Field.create()という公開APIは作らない)。trimはTemplate側(呼び出し側)で行う。
- Template:
  - コンストラクタはprivate。ルール: name非空 ／ field.order(1始まり)は重複なし(Fieldどうしの関係でしか判定できないためTemplate側で検証) → Templateのコンストラクタで検証する
  - `createdAt`は持たない(`updatedAt`のみ)。`create()`はid・ownerId・fields(各fieldのidも必須)・updatedAtを明示パラメータ化。
  - `edit(params, now)`: name・fields一式を置き換える(差分更新ではない)。新規fieldのidは呼び出し側で採番済みである前提(3-7)。
  - 「利用中テンプレートの構造変更制限」はドメインに実装せず(3-3)、`isOwnedBy(accountId)`のみ用意した。
- interface.ts: TemplateRepositoryは`findById`/`findMany`/`newCreate`/`save`/`delete`。Accountの`newCreate`/`save`分離パターンを踏襲(CreateTemplateRequestが外部境界からの生入力のみを受け取るため、Accountと同様にid採番をRepository側に委ねる構成とした)。

### 3-C. note/section.ts, note/note.ts

- Section: 子エンティティ。content検証なし(空文字許容。05の注記通り、MVPでは必須チェックをドメイン層で行わない)。単体ファクトリなし。
- Note:
  - `create()`のsections検証方針(fieldIdの過不足チェック)は**合意済み**: sectionsのfieldIdがtemplate.fieldsのfieldIdと過不足なく一致するかを**厳密に検証する**。
    - ただし検証場所はドメイン層(Note)ではなく**Service層(アプリケーションサービス)**とする。Note単体(このコンストラクタ)ではTemplateという別集約の実体を参照できないため、「単一集約内で判定できない制約はドメイン層で検証しない」という既存の原則(Account/Template/Note共通)に従う。Templateの「利用中テンプレートの構造変更制限」(3-3)と同じ考え方。
    - external層実装時(Note Service)で、Template.fieldsのfieldId集合とsections(またはCreateNoteRequest.sections)のfieldId集合を突き合わせ、不一致があれば例外を投げる実装とする。
  - `edit()`: title / sectionsのcontentのみ変更可能。templateIdは受け取らない(3-4)
  - `publish()` / `unpublish()`: Draft⇄Publishの状態遷移が不正な場合は例外(throw new Error)
  - `canBeViewedBy(viewerId)`: Publishは誰でも閲覧可、Draftは本人のみ
  - createdAt/updatedAtは、Accountの`create()`拡張(単一の`now`ではなく明示パラメータ化した変更)に倣う
- interface.ts: NoteRepository。`findMany`にviewerIdを必須で持たせる(07の「公開済みまたは自分のノートを取得」ルール)。`existsByTemplateId`はTemplate側のisUsed判定(3-3)に使う。

### 3-D. services/note-publication-policy.ts

- `canPublish(note, account)` / `canUnpublish(note, account)`: boolean返却、interfaceは不要(すでに合意済み)
- Note集約の`isOwnedBy`と役割が重なるように見えるが、05でAccount×Noteをまたぐ独立したドメインサービスとして明示的に定義されているため、集約内メソッドとは分離して実装する

## 4. 実装時の注意点(全体)

- 各ファイル作成後、必ず `npx tsc --noEmit -p tsconfig.json` と `npx biome check` を実行し、エラー0を確認する
- 命名は`03_ubiquitous_language.md`の用語に厳密に従う。存在しない用語を新規導入する場合は必ず確認を取る
- JSDocに、対応する設計書のセクション(見出し名)を記載する(account.tsの記法に倣う)
