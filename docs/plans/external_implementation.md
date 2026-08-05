# External層実装計画(引き継ぎメモ)

このファイルは作業単位の一時的な引き継ぎ資料であり、`docs/global_design/`の設計書と同格には扱わない。作業完了後は削除してよい。

## 目的

`frontend/src/external`配下に、domain層以外(repository・service・dto・handler)を実装する。domain層(Account/Template/Note)は完了済み。

## 現状

- domain層: Account/Template/Note すべて実装済み(`frontend/src/external/domain/`)
- DB層: `accounts`テーブルのみ実装・動作確認済み(`frontend/src/external/client/database/`)。templates/fields/notes/sectionsは未着手
- external層: **Accountのみ実装・動作確認済み**(`external/repository/account/`、`external/service/account/`、`external/dto/account/`、`external/handler/account/`)。Template/Noteは未着手
- 認証基盤: 未導入(後述のプレースホルダで代替中)

## 進め方

1. ~~Accountのみ、external層を一通り実装する~~ **完了**
2. **Template・Noteは、集約ごとに「DBスキーマ実装 → external層実装」の順で進める**(Accountの実装順を踏襲)
   - 例: Templateのテーブル(`templates`/`fields`)を`external/client/database/schema.ts`に追加・動作確認 → Templateのexternal層(Repository→Service→dto→Handler)を実装。完了後、同じ流れでNoteに着手
   - Templateは子エンティティField、Noteは子エンティティSection＋Template参照＋viewerId付きクエリなど、Accountにはない複雑さがあるため、下記「Accountの実装で確立したパターン」をそのまま当てはめられない箇所がある。都度ユーザーに確認する
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

## Templateのexternal層実装方針(合意済み、Repository以降は別セッションで実装)

以下はTemplateのテーブル実装セッション中にユーザーと合意した、Repository/Service/DTO/Handler(Step3以降)の設計方針。**このセッションのスコープはテーブル実装(schema.ts)と、それに必要なclient/の実装・動作確認のみ**であり、Repository以降は実装しない。次にTemplateのexternal層に着手するセッションはこの記述を出発点とする。

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

- コンストラクタは`TemplateRepository & TemplateDetailReader`(交差型。`TemplateDetailReader`は上記`findDetailById`/`findManyDetail`のみを持つ、domain外で定義する読み取り専用インターフェース)を受け取る。シングルトン配線は`new TemplateService(new DrizzleTemplateRepository())`のまま(1インスタンスが両方を満たす)
- `createTemplate(ownerId, input)`: `repository.newCreate()`を呼ぶだけ
- `editTemplate(id, input, accountId)`: 取得→`isOwnedBy`チェック(所有者以外はエラー)→新規fieldにid採番→`template.edit()`→`repository.save()`。**isUsedによる変更制限は今回実装しない**(常に全項目変更可能として扱う。Note実装時に`NoteRepository`(`existsByTemplateId`、単体チェック)を注入し制限ロジックを追加するTODO。`docs/plans/domain_implementation.md`3-3参照)
- `deleteTemplate(id, accountId)`: 取得→`isOwnedBy`チェック→`repository.delete()`。**isUsedによる削除制限も今回は見送り**(Note実装時、単体チェック用の`existsByTemplateId`を使用)
- `getTemplateDetailById(id)` / `listTemplateDetails(params)`: `findDetailById`/`findManyDetail`への委譲のみ。**isUsedは今回常に`false`固定**で組み立てる
  - **Note実装後のisUsed N+1対策(TODO)**: `listTemplateDetails`で一覧の各行にisUsedを付与する際、`existsByTemplateId`を行ごとに呼ぶとN+1になる。`NoteRepository`にバッチ判定用の`existsByTemplateIds(templateIds: string[]): Promise<Set<string>>`(`SELECT DISTINCT template_id FROM notes WHERE template_id IN (...)`の1クエリ)を追加し、`findManyDetail`で取得したtemplate群のidをまとめて渡し、1回のクエリで判定する。単体の`getTemplateDetailById`は元々1件なので既存の`existsByTemplateId`のままでよい

### DTO(`external/dto/template/template-dto.ts`)

- `createTemplateRequestSchema`(name, fields[](idなし)) / `editTemplateRequestSchema`(id, name, fields[](既存fieldはid必須、新規は省略可)) / `templateResponseSchema`(owner・fields・updatedAt(ISO)・`isUsed`を含む)
- `isUsed`は**今回常に`false`固定**を返す(TODOコメントを付す。将来の対応は上記Serviceの「isUsed N+1対策」参照)
- `toTemplateResponse(template, owner, isUsed)`: `TemplateService`の`TemplateDetail`(＋isUsed)から変換する

### Handler(`external/handler/template/`)

- `template.query.server.ts`: `templateService.getTemplateDetailById(id)` / `listTemplateDetails(params)`を呼び、`toTemplateResponse()`でDTO変換するだけ。`db`への直接依存はなく、Accountの「Service呼び出しのみ」パターンに準拠する
- `template.query.action.ts`: `withAuth`でラップ
- `template.command.server.ts`: zodバリデーション→Service呼び出し→DTO変換
- `template.command.action.ts`: `withAuth`でラップ(Owner判定は`withAuth`が渡す`accountId`をServiceへそのまま渡す)

## 次に行うこと

Templateのテーブル実装に着手する(このセッションのスコープ)。

1. `external/client/database/schema.ts`に`templates`/`fields`テーブルと上記`relations()`を追加し、動作確認する(`docs/global_design/06_database_design.md`「templates」「fields」に従う)
2. (別セッション)Templateのexternal層(Repository→Service→dto→Handler)を、上記「Templateのexternal層実装方針」および「Accountの実装で確立したパターン」に沿って実装する
3. 完了後、同じ流れでNoteに着手する(`notes`/`sections`テーブル→external層。viewerId付きクエリ等、Note固有の設計は都度確認する)
