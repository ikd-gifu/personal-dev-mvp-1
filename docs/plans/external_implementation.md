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

### 実装時の補足(計画からの変更点)

- **Service**: 当初案の2引数(`repository`/`detailReader`)に加え、owner詳細解決のため`accountRepository: AccountRepository`(Account集約のドメインport)を3つ目の引数として追加した。`createTemplate`/`editTemplate`は書き込み後に`accountRepository.findById(ownerId)`でowner情報を取得し、`getTemplateDetailById`/`listTemplateDetails`と同じ`{ template, owner, isUsed }`の形(`TemplateDetailResult`)に統一して返す。AccountService(ユースケース層)ではなくAccountRepository(ポート)を注入した理由: 他集約への依存はユースケース層同士より、ポート(インターフェース)どうしの方が結合が弱いため
- **DTO**: `createTemplateRequestSchema`/`editTemplateRequestSchema`のfieldsに`.refine()`で「orderは1から始まる連番」チェックを追加(ドメイン層は正整数・重複禁止のみ検証のため、07_api_design.mdのビジネスルールをDTO境界で補完。CLAUDE.mdの「DTO側は同じかより厳密なルールにする」に基づく)。加えて`getTemplateByIdRequestSchema`/`listTemplatesRequestSchema`をquery系にも新設し、id/ownerIdのuuid形式を境界で検証する(下記「既知の不整合」参照)
- **Handler(query系)**: `template.query.server.ts`/`template.query.action.ts`はどちらも上記DTOスキーマで`.parse()`する(account参照実装のquery系にはない検証を追加)
- **Handler(command系)**: `input: unknown`のまま維持し、DTO型(`CreateTemplateRequest`等)には変更しなかった(account実装と同じ方針)。`unknown`はnarrowingされるまでプロパティアクセスを一切許さないため、「`.parse()`を経ずに未検証の値を誤って使う」ミスをコンパイラのレベルで機械的に防げる。DTO型で受け取る案(`request: CreateTemplateRequest`)も一度試したが、この安全網を優先し不採用とした

## 既知の不整合(将来対応)

- **境界(id/クエリパラメータ)のuuid検証がAccount/Templateで非対称**: Templateの`getTemplateByIdQuery`/`getTemplateByIdAction`・`listTemplatesQuery`/`listTemplatesAction`は、DTOのzodスキーマ(`getTemplateByIdRequestSchema`/`listTemplatesRequestSchema`)で`id`/`ownerId`のuuid形式を検証している(`.query.action.ts`と`.query.server.ts`の両方で検証。`.query.action.ts`はクライアントから直接呼び出せるServer Actionのため、型(`string`)だけでは実行時の不正な値を防げないことへの対策)。一方`account.query.server.ts`/`account.query.action.ts`の`getAccountByIdQuery`/`getAccountByIdAction`/`getCurrentAccountAction`は同様の検証を行わず、`id: string`をそのままDrizzleへ渡している。不正な形式のidが渡されると、DB(uuid列)側で未処理の例外(500相当)になりうる。
  - TODO: Note実装時、またはAccountの見直しセッションで、`account.query.server.ts`/`account.query.action.ts`にも同様のuuid検証を追加し、非対称を解消する

## 次に行うこと

Templateのexternal層は完了。次はNoteに着手する(別チャットで継続)。

1. Note集約のテーブル(`notes`/`sections`)を`external/client/database/schema.ts`に追加し、`relations()`を含めて動作確認する(`docs/global_design/06_database_design.md`「notes」「sections」に従う。Templateのテーブル実装セッションと同じ進め方)
2. (別セッション)Noteのexternal層(Repository→Service→dto→Handler)を、「Accountの実装で確立したパターン」および今回のTemplate実装(「実装時の補足」含む)を参照実装として実装する
3. Note固有の複雑さ(Section子エンティティ、Template参照、viewerId付きクエリ、Template使用チェック`existsByTemplateId`/バッチ判定用`existsByTemplateIds`の実装など)は都度ユーザーに確認する
4. Note実装完了後、Template側に残るTODO(isUsedの実装、Account側のuuid検証追加など。上記「既知の不整合」参照)を反映する
