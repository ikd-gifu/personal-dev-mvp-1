# External層実装計画(引き継ぎメモ)

このファイルは作業単位の一時的な引き継ぎ資料であり、`docs/global_design/`の設計書と同格には扱わない。作業完了後は削除してよい。

## 目的

`frontend/src/external`配下に、domain層以外(repository・service・dto・handler)を実装する。domain層(Account/Template/Note)は完了済み。

## 現状

- domain層: Account/Template/Note すべて実装済み(`frontend/src/external/domain/`)
- DB層: `accounts`/`templates`/`fields`テーブル実装・動作確認済み(`frontend/src/external/client/database/`)。notes/sectionsは未着手
- external層: **Account/Templateが実装済み**(`external/{repository,service,dto,handler}/{account,template}/`)。Noteは未着手
- 認証基盤: 未導入(後述のプレースホルダで代替中)

## 進め方

1. ~~Accountのみ、external層を一通り実装する~~ **完了**
2. **Template・Noteは、集約ごとに「DBスキーマ実装 → external層実装」の順で進める**(Accountの実装順を踏襲)
   - Template: テーブル実装(`templates`/`fields`) **完了** → external層(Repository→Service→dto→Handler) **完了**(詳細は下記「Templateのexternal層実装方針」の「実装時の補足」を参照)
   - Note: 同じ流れで着手する(次はテーブル実装+client配下から。別チャットで継続)
   - Templateは子エンティティField、Noteは子エンティティSection＋Template参照＋viewerId付きクエリなど、Accountにはない複雑さがあるため、「Accountの実装で確立したパターン」をそのまま当てはめられない箇所がある。都度ユーザーに確認する
3. Account/Template/Noteの3つが揃った時点で、共通パターンを`frontend/docs/`に文書化する(恒久的な設計方針。CLAUDE.mdの「情報の優先順位」に新設した第3階層)
4. 文書化した方針に沿って、必要なら実装を整理し直す

## Accountの実装で確立したパターン(Template/Noteもこれに従う)

これらは設計書(`docs/global_design/`)には明記がなく、Accountの実装セッション中にユーザーと合意した、プロジェクト固有の実装方針。`frontend/docs/`が未作成の現時点では、この記述が実質的な正。

### ディレクトリ構成

集約ごとに`external/repository/<集約名>/`・`external/service/<集約名>/`・`external/dto/<集約名>/`・`external/handler/<集約名>/`を作る(Accountの例に倣う)。

### Repository

- ドメイン層の`<集約名>Repository`インターフェース(ポート)をDrizzleで実装するアダプタ。クラス名は`Drizzle<集約名>Repository`
- **既知の未修正の問題**: `newCreate`はDBへの`INSERT`を先に実行し、その戻り値を`toDomain()`(内部で`Account.create()`等を呼ぶ)でドメインモデルへ変換する順序になっている。そのため、ドメイン層の不変条件チェック(例: Emailの形式)に違反する値であっても、**先にDBへ書き込まれてから**例外が投げられる。DTO境界(zod)でどこまで弾けるかに依存するが、Template/Noteの新規実装ではこの順序問題を踏まえて設計を検討すること(`external/repository/account/account-repository.ts`参照)

### Service

- ユースケース(業務フロー)の組み立てのみを担う。「DBアクセスの詳細」はRepository、「業務ルール」はEntity(ドメイン層)に委ねる
- **コンストラクタインジェクション**で`<集約名>Repository`(インターフェース型)を受け取る。Service自身は具象のRepository実装を知らない
  - 例外: Templateのように、ドメインportに含めない読み取りモデル(JOINを伴う表示用データ)を別途持つ集約では、コマンド側(`<集約名>Repository`)とクエリ側(読み取りモデル用インターフェース)を別引数で受け取る。詳細は下記「Templateのexternal層実装方針」Service参照
- ファイル末尾で`export const <集約名>Service = new <集約名>Service(new Drizzle<集約名>Repository());`のようにシングルトンをexportする
- **「現在ログイン中のユーザー」というセッションの概念をServiceに持ち込まない**。Serviceは`id`を渡されれば処理するだけにする。「今誰がログインしているか」の解決はHandler層(`*.query.server.ts`/`*.action.ts`、`withAuth`経由)の責務とする

### DTO

- リクエスト/レスポンスの形とバリデーションルールはzodスキーマで定義する(`z.object()` + `z.infer`で型導出。`interface`を手書きしない)
- 形式が明確な項目にはzod v4のトップレベル形式バリデータ(`z.email()`・`z.uuid()`・`z.iso.datetime()`等)を使う
- ドメインモデル→DTOへの変換関数(`to<集約名>Response`)はDTOファイル内に置く
- リクエストのバリデーションは境界(DTO)で行う。ドメイン層の緩いチェック(例: Emailは`@`を含むかのみ)を弛めることにはならないよう、DTO側は同じかより厳密なルールにする

### Handler層(CQRS + Data Access Layerパターン。Route Handlerは使わない)

Next.js公式ドキュメント(`node_modules/next/dist/docs/01-app/02-guides/data-security.md`)の「Data Access Layer」パターンに準拠。`app/api/`配下のRoute Handlerは作らない。

集約ごとに以下のファイルを`external/handler/<集約名>/`に作る(操作がない場合はそのファイル自体を作らない。空ファイルを置かない)。

| ファイル | 内容 |
| --- | --- |
| `<集約名>.query.server.ts` | `import "server-only"`。読み取り専用のDAL関数。Service呼び出し＋DTO変換のみ |
| `<集約名>.query.action.ts` | `"use server"`。上記を`withAuth`でラップし、Client Componentから呼び出し可能にする |
| `<集約名>.command.server.ts` | `import "server-only"`。書き込み系のDAL関数。zodバリデーション＋Service呼び出し＋DTO変換 |
| `<集約名>.command.action.ts` | `"use server"`。上記を`withAuth`でラップ。**ただし、正規の業務フローを経ずにクライアントから直接呼ばれると問題がある操作(例: OAuth登録のような外部境界からの新規作成)は`.action`を作らず`.server`のみに留める**。操作ごとにこの要否を検討し、判断に迷う場合はユーザーに確認する |

### 認証(プレースホルダ)

- `frontend/src/features/auth/servers/`に認証まわりの共通処理がある。Template/Noteの`.action`ファイルもこれを再利用する
  - `session.server.ts`: `getSessionServer()`(**未実装。呼ぶと必ず例外を投げる**)＋`AuthenticatedSession`型
  - `redirect.server.ts`: `getAuthenticatedSessionServer()`(未認証なら`/login`へredirect)
  - `auth.guard.ts`: `withAuth(handler)`(認証済みaccountIdを`{ accountId }`というctxでhandlerに渡す)
- better-auth等の認証基盤本体の導入は別タスク。Template/Noteの実装時も、上記プレースホルダをそのまま利用する(新たに作り直さない)
- Owner判定(本人のみ更新・削除可能等)が必要な操作は、`withAuth`が渡す`accountId`を使って判定する

### 依存関係

- `zod`・`server-only`は追加済み。Template/Noteで再度追加不要

### スコープ外(継続)

- 自動テスト(vitest等)の導入・テストコード作成
- better-auth等、認証基盤本体の導入

## Templateのexternal層実装方針(実装完了)

以下はTemplateのテーブル実装セッション中に合意した設計方針で、その後別セッションでRepository〜Handlerまで実装済み。Note実装時は、この記述と末尾の「実装時の補足」を、Account実装と同格の参照実装として扱ってよい。

### Repository(`external/repository/template/template-repository.ts`)

- `findById`/`findMany`(ドメインの`TemplateRepository`ポート実装): `schema.ts`に`relations()`(`templatesRelations`: `fields: many(fields)` / `owner: one(accounts)`、`fieldsRelations`: `template: one(templates)`)を定義し、`db.query.templates.findFirst/findMany({ with: { fields: true } })`のようにネストして取得→ドメインTemplateへ変換(ownerIdのみを持つ。owner本体は持たない)
- `newCreate`: `db.transaction`内でtemplates INSERT→返ったidでfields複数件INSERT→ドメインTemplateへ変換して返す(Accountの`newCreate`同様、DB書き込み→ドメイン変換の順。Accountの「既知の未修正の問題」を踏襲)
- `save`(edit時): `db.transaction`内で
  1. templates UPDATE(name, updatedAt)
  2. 渡された`template.fields`とDB上の既存fieldsをidで突き合わせ、**差分方式**(DBのみに存在→DELETE、両方に存在→UPDATE、渡された側のみに存在(新規)→明示idでINSERT)を採用する。全削除→再INSERT方式は不採用: `sections→fields`がCASCADEなし参照のため、field.idが変わると既存ノートの記入内容(sections)が孤立・破損するリスクがあるため
  - 新規fieldのidは呼び出し側(Service)が`crypto.randomUUID()`で事前採番し、`Template.edit()`に渡す(`template.ts`のJSDocどおり)
  - fieldのDELETEは、将来sectionsが実装された状態で使用中fieldを消そうとするとDBの外部キー制約違反で失敗する(＝「使用中field削除不可」をDB制約が自然に担保する)
- `delete`: templates DELETE(fieldsはON DELETE CASCADEで自動削除)
- **`findDetailById(id)` / `findManyDetail(params)`(ドメインportには含めない、読み取り専用の追加メソッド)**: `db.query.templates.findFirst/findMany({ with: { fields: true, owner: true } })`という1クエリで`{ template: Template, owner: { id, firstName, lastName, thumbnail } }`(`TemplateDetail`型)を返す。Drizzleのrelationsクエリは関連先を1回のSQLにまとめて取得する(行ごとに再クエリしない)ためN+1にならない。`TemplateDetail`型は`external/repository/template/`か`external/dto/template/`に定義し、domain/interface.tsには置かない(06_database_design.md「集約間の結合度: 他の集約への参照はIDのみ」の原則により、ドメインportにAccountの実データを混ぜない)

### Service(`external/service/template/template-service.ts`)

- コンストラクタは`repository: TemplateRepository`(集約の読み書き＝コマンド側)と`detailReader: TemplateDetailReader`(上記`findDetailById`/`findManyDetail`のみを持つ、domain外で定義する読み取りモデル専用インターフェース＝クエリ側)を**別々の引数**で受け取る。Handler層のCQRS分離(`*.query.server.ts` / `*.command.server.ts`)と同じ発想を、Serviceのコンストラクタでも可視化するため、交差型(1引数)にはしない。シングルトン配線は`export const templateService = new TemplateService(new DrizzleTemplateRepository(), new DrizzleTemplateRepository());`(具象クラスは同一だが、コマンド側・クエリ側それぞれの引数として2回渡す)
- `createTemplate(ownerId, input)`: `repository.newCreate()`を呼ぶだけ
- `editTemplate(id, input, accountId)`: 取得→`isOwnedBy`チェック(所有者以外はエラー)→`existsByTemplateId`でisUsed判定→使用中なら`assertFieldStructureUnchanged`(下記)でフィールド構造変更を検証→新規fieldにid採番→`template.edit()`→`repository.save()`。**実装済み**(Note実装後の別ステップで、`NoteRepository`を注入して対応)
  - **`assertFieldStructureUnchanged`(Service内のprivateメソッド)**: isUsed=true時、07_api_design.mdの「フィールドの追加/削除/order変更は不可、name/label/isRequiredの変更は可」を検証する。既存fieldとの比較(id集合の一致・order一致)が必要で、Noteリポジトリへの問い合わせ結果(isUsed)にも依存するため、ドメイン層(`template.ts`)ではなくここに置く(`template.ts`のJSDoc「利用中テンプレートの構造変更制限」の記述どおり)
  - editはtemplateIdを変えないため、edit前後でisUsedは変わらない。そのため`existsByTemplateId`は1回だけ呼び、構造変更チェックとレスポンスの両方に使い回す
- `deleteTemplate(id, accountId)`: 取得→`isOwnedBy`チェック→`existsByTemplateId`でisUsed判定→使用中なら`Error("Template is in use")`をthrow→`repository.delete()`。**実装済み**
- `getTemplateDetailById(id)` / `listTemplateDetails(params)`: `findDetailById`/`findManyDetail`への委譲後、**実装済み**。`getTemplateDetailById`は`existsByTemplateId`(単体)、`listTemplateDetails`は`existsByTemplateIds`(バッチ)でisUsedを実値化
  - **isUsed N+1対策**: `listTemplateDetails`は一覧のtemplateId群をまとめて`existsByTemplateIds`(`SELECT DISTINCT template_id FROM notes WHERE template_id IN (...)`の1クエリ)に渡し、`Set.has(id)`で判定する(行ごとに`existsByTemplateId`を呼ぶN+1を回避)。単体の`getTemplateDetailById`は元々1件なので`existsByTemplateId`のままでよい

### DTO(`external/dto/template/template-dto.ts`)

- `createTemplateRequestSchema`(name, fields[](idなし)) / `editTemplateRequestSchema`(id, name, fields[](既存fieldはid必須、新規は省略可)) / `templateResponseSchema`(owner・fields・updatedAt(ISO)・`isUsed`を含む)
- `isUsed`は**今回常に`false`固定**を返す(TODOコメントを付す。将来の対応は上記Serviceの「isUsed N+1対策」参照)
- `toTemplateResponse(template, owner, isUsed)`: `TemplateService`の`TemplateDetail`(＋isUsed)から変換する

### Handler(`external/handler/template/`)

- `template.query.server.ts`: `templateService.getTemplateDetailById(id)` / `listTemplateDetails(params)`を呼び、`toTemplateResponse()`でDTO変換するだけ。`db`への直接依存はなく、Accountの「Service呼び出しのみ」パターンに準拠する
- `template.query.action.ts`: `withAuth`でラップ
- `template.command.server.ts`: zodバリデーション→Service呼び出し→DTO変換
- `template.command.action.ts`: `withAuth`でラップ(Owner判定は`withAuth`が渡す`accountId`をServiceへそのまま渡す)

### 実装時の補足(計画からの変更点)

- **Service**: 当初案の2引数(`repository`/`detailReader`)に加え、owner詳細解決のため`accountRepository: AccountRepository`(Account集約のドメインport)を3つ目の引数として追加した。`createTemplate`/`editTemplate`は書き込み後に`accountRepository.findById(ownerId)`でowner情報を取得し、`getTemplateDetailById`/`listTemplateDetails`と同じ`{ template, owner, isUsed }`の形(`TemplateDetailResult`)に統一して返す。AccountService(ユースケース層)ではなくAccountRepository(ポート)を注入した理由: 他集約への依存はユースケース層同士より、ポート(インターフェース)どうしの方が結合が弱いため
- **DTO**: `createTemplateRequestSchema`/`editTemplateRequestSchema`のfieldsに`.refine()`で「orderは1から始まる連番」チェックを追加(ドメイン層は正整数・重複禁止のみ検証のため、07_api_design.mdのビジネスルールをDTO境界で補完。CLAUDE.mdの「DTO側は同じかより厳密なルールにする」に基づく)。加えて`getTemplateByIdRequestSchema`/`listTemplatesRequestSchema`をquery系にも新設し、id/ownerIdのuuid形式を境界で検証する(下記「既知の不整合」参照)
- **Handler(query系)**: `template.query.server.ts`/`template.query.action.ts`はどちらも上記DTOスキーマで`.parse()`する(account参照実装のquery系にはない検証を追加)
- **Handler(command系)**: `input: unknown`のまま維持し、DTO型(`CreateTemplateRequest`等)には変更しなかった(account実装と同じ方針)。`unknown`はnarrowingされるまでプロパティアクセスを一切許さないため、「`.parse()`を経ずに未検証の値を誤って使う」ミスをコンパイラのレベルで機械的に防げる。DTO型で受け取る案(`request: CreateTemplateRequest`)も一度試したが、この安全網を優先し不採用とした

## Noteのexternal層実装方針(合意事項。実装セッション前の調査で確認済み)

Note集約のテーブル実装(`notes`/`sections`、`schema.ts`)は完了済み。以下はexternal層(Repository〜Handler)実装前に合意した設計方針。Templateの「実装時の補足」と同様、実装セッションでは参照実装として扱ってよいが、実装中に見つかった変更点は都度この節に追記すること。

### sections検証方針(ドメイン実装計画3-Cから移動・確定)

- **sectionsのfieldIdはtemplate.fieldsのfieldIdと過不足なく一致するかを厳密に検証する**(合意済み)
- 検証場所は**Note Service層**(ドメイン層ではない)。Templateという別集約の実体(fields)を参照する必要があるため、Note単体のコンストラクタでは判定できない(3-3のTemplate使用中チェックと同じ考え方)
- そのため`NoteService`のコンストラクタは`repository`(`NoteRepository`)・`detailReader`(下記`NoteDetailReader`)・`accountRepository`(`AccountRepository`)に加え、**`templateRepository: TemplateRepository`**を注入する(Template.fieldsを取得するため)

### Repository(`external/repository/note/note-repository.ts`)

- `findById`/`findMany`(ドメインの`NoteRepository`ポート実装): `db.query.notes.findFirst/findMany({ with: { sections: true } })`で取得→ドメインNoteへ変換。`findMany`は`viewerId`必須("公開済みまたは自分のノート"をWHERE句で実装。07「ビジネスルール」)＋`q`/`status`/`templateId`/`ownerId`の任意フィルタ
- `newCreate`: `db.transaction`内でnotes INSERT→返ったidでsections複数件INSERT→ドメインNoteへ変換して返す(Account/Templateの`newCreate`と同じ「DB書き込み→ドメイン変換」の順序を踏襲)
- `save`(edit時): `db.transaction`内でnotes UPDATE(title/status/updatedAt)＋sections UPDATE(content)のみ。Note.edit()はtemplateIdを受け取らず、sectionの追加・削除も発生しない(fieldId構成は不変のため)ので、Templateのような差分INSERT/DELETEは不要で全件UPDATEのみでよい
- `delete`: notes DELETE(sectionsはON DELETE CASCADEで自動削除)
- `existsByTemplateId(templateId)`: `SELECT EXISTS(SELECT 1 FROM notes WHERE template_id = ...)`。**今回のNote実装内で実装する**(NoteRepositoryポートに定義済みのため)。ただし`TemplateService`側(isUsed判定)への配線は、Note external層が実装・動作確認できた後の別ステップで行う(合意事項4)
- **`findDetailById(id)` / `findManyDetail(params)`(ドメインportには含めない読み取り専用の追加メソッド)**: `db.query.notes.findFirst/findMany({ with: { sections: { with: { field: true } }, owner: true } })`で1クエリ取得し、`{ note: Note, owner: {...}, sections: [{ ...section, fieldLabel, isRequired }] }`(`NoteDetail`型)を返す。07_api_design.mdの`NoteResponse.sections`が`fieldLabel`/`isRequired`を要求するため、Templateの`TemplateDetail`と同じ「ドメインportに含めない結合済み読み取りモデル」パターンを踏襲する

### Service(`external/service/note/note-service.ts`)

- コンストラクタは`repository: NoteRepository`・`detailReader: NoteDetailReader`・`accountRepository: AccountRepository`・`templateRepository: TemplateRepository`の4つ(Templateの3引数パターンに、fieldId検証・sections自動生成用の`templateRepository`を追加)
- `createNote(ownerId, input)`:
  1. `templateRepository.findById(input.templateId)`でTemplateを取得(存在しない場合はエラー。07「指定されたテンプレートが存在する必要がある」)
  2. `input.sections`が未指定の場合、Template.fieldsから空content(`""`)のsectionsを自動生成する(07「sectionsが未指定の場合、テンプレートのフィールドから空のセクションを自動生成」)
  3. `input.sections`が指定されている場合は、fieldId集合がTemplate.fieldsのfieldId集合と過不足なく一致するか検証する(上記「sections検証方針」)
  4. `repository.newCreate()`を呼ぶ
- `editNote(id, input, accountId)`: 取得→`isOwnedBy`チェック→`note.edit()`(templateIdは受け取らない。3-4)→`repository.save()`
- `deleteNote(id, accountId)`: 取得→`isOwnedBy`チェック→`repository.delete()`
- `publishNote(id, accountId)`/`unpublishNote(id, accountId)`: 取得→`accountRepository.findById(accountId)`→`note-publication-policy.ts`の`canPublish`/`canUnpublish`で判定→`note.publish()`/`note.unpublish()`→`repository.save()`
- `getNoteDetailById(id, viewerId)`: `detailReader.findDetailById(id)`で取得→`note.canBeViewedBy(viewerId)`が`false`ならnull相当を返す(07「見つからない場合、nullを返す」を「閲覧不可の場合もnullを返す」まで含めるかは実装時に要確認)
- `listNoteDetails(params)`: `params.viewerId`を`detailReader.findManyDetail()`にそのまま渡す(公開済み/自分のノードのみ返す絞り込みはRepository層のWHERE句で行う)

### DTO(`external/dto/note/note-dto.ts`)

- `createNoteRequestSchema`(title, templateId, sections?(fieldIdなし省略可)) / `editNoteRequestSchema`(id, title, templateId(受け取るがServiceでは無視。3-4), sections(id必須, content)) / `noteResponseSchema`(owner・sections(fieldLabel/isRequired含む)・status・timestamps(ISO))
- `getNoteByIdRequestSchema`/`listNotesRequestSchema`をquery系にも新設し、id/templateId/ownerIdのuuid形式を境界で検証する(Templateの「実装時の補足」と同じ方針。Accountとの非対称は「既知の不整合」参照)

### Handler(`external/handler/note/`)

- `note.query.server.ts`/`note.query.action.ts`: 一覧・詳細取得。詳細取得時は`withAuth`が渡す`accountId`を`viewerId`としてServiceへ渡す
- `note.command.server.ts`/`note.command.action.ts`: 作成・更新・削除・公開(`/publish`)・非公開(`/unpublish`)。publish/unpublishは07のとおり`POST /api/notes/:id/publish`(action形式)に対応する専用コマンド関数を用意する

## 既知の不整合(解消済み)

- **境界(id/クエリパラメータ)のuuid検証がAccount/Templateで非対称**: Templateの`getTemplateByIdQuery`/`getTemplateByIdAction`・`listTemplatesQuery`/`listTemplatesAction`は、DTOのzodスキーマ(`getTemplateByIdRequestSchema`/`listTemplatesRequestSchema`)で`id`/`ownerId`のuuid形式を検証している(`.query.action.ts`と`.query.server.ts`の両方で検証)。かつては`account.query.server.ts`/`account.query.action.ts`が同様の検証を行っていなかったが、`account-dto.ts`に`accountIdSchema`(`z.uuid()`単体。Accountは`id`をオブジェクトではなく素の文字列引数で受け取る形状のため、Templateの`z.object({id: z.uuid()})`とは形が異なる)を追加し、`getAccountByIdQuery`/`getAccountByIdAction`双方で`.parse()`するよう解消した(`getCurrentAccountAction`はセッション由来の`accountId`を`getAccountByIdQuery`にそのまま渡す経路のため、そちら側の検証で担保される)。

## 次に行うこと

Template⇄Noteの連携(isUsedの実値化、`existsByTemplateIds`によるバッチ判定、`deleteTemplate`/`editTemplate`の使用中制限、Account側uuid検証)まで完了。

- `TemplateService`は`noteRepository: NoteRepository`を4番目の引数として注入し、`getTemplateDetailById`/`listTemplateDetails`のisUsedを実値化、`deleteTemplate`の使用中削除禁止、`editTemplate`の使用中フィールド構造変更制限(`assertFieldStructureUnchanged`)まで実装・実DBで動作確認済み
- 残っている既知の項目: 自動テスト(vitest等)の未導入、`newCreate`系の「DB書き込み→ドメイン変換」順序の既知の問題(Account/Template/Note共通)
