# まとめてケンタさん — 仕様書

> みんなの注文、最安セットで。

---

## 概要

複数人でKFCを注文するとき、単品とセットを最適に組み合わせて合計金額を最小化する。
メニューデータは `public/menu.json` から取得する。

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | React 18 |
| ビルド | Vite |
| スタイル | CSS Modules (`App.module.css`) |
| 状態管理 | React hooks のみ（外部ライブラリなし） |
| 永続化 | localStorage |
| データソース | `public/menu.json`（静的ファイル） |
| ホスティング | GitHub Pages |

---

## ファイル構成

```
src/
  App.jsx            # メインコンポーネント（UIと状態管理）
  App.module.css     # スタイル
  main.jsx           # エントリポイント
  hooks/
    useMenu.js       # メニューデータ取得フック
  utils/
    optimizer.js     # 最適化・提案ロジック
public/
  menu.json          # メニューデータ（items / sets / sideGroups）
  manifest.json      # PWA設定
  icon-192.png
  icon-512.png
```

---

## データ構造

### items（単品メニュー）

```js
{ id: string, name: string, price: number, category: string }
```

カテゴリ: `チキン` / `バーガー` / `サイド` / `ドリンク` / `キッズ`

### sets（セットメニュー）

```js
{
  id: string,
  name: string,
  price: number,
  contains: { [itemId]: number },   // 固定で含まれる商品（id: 数量）
  freeGroups: [{ groupId, count }], // 自由選択サイドの枠
}
```

### sideGroups（サイドグループ）

セットで選べるサイドメニューの選択肢。

```js
{
  [groupId]: [{ itemId: string, extra: number }]  // extraは追加料金（円）
}
```

### メンバー

```js
{ id: number, name: string, colorIdx: number }
```

### カート

```js
{ id: number, memberId: number, itemId: string, qty: number }
```

---

## データ取得（useMenu.js）

`/menu.json`（Vite base考慮で `./menu.json`）を1回fetchする。

- ステータス: `loading` / `success` / `error`
- `reload()` で再取得可能
- `fetchedAt` は `menu.json` の `updated` フィールドの日付

---

## 最適化ロジック（optimizer.js）

### optimize()

`optimize(items, sets, qty, sideGroups)` で最安構成を返す。

#### 引数

- `items`: 全単品リスト
- `sets`: 利用可能なセットリスト（ランチフィルタ適用済み）
- `qty`: `{ [itemId]: number }` 欲しい数量
- `sideGroups`: サイドグループの選択肢

#### アルゴリズム

1. **絞り込み**: `qty` に関係するセットのみ対象（`relevantSets`）
   - 固定アイテムを持つセットは、そのアイテムが `qty` に存在するものだけ
   - `freeGroups` のみのセットは、そのグループに `qty` の商品が含まれるものだけ
2. **ブルートフォース**: 各セットの使用数（0〜maxN）を全探索（再帰）
   - 枝刈り: セットコストが現時点のベストを超えたら打ち切り
   - `best` の初期値を単品合計（`singleOnly`）に設定
3. **サイド選択** (`chooseSides`): セットの自由枠を、欲しいものを優先・追加料金が安い順で貪欲に埋める
4. **余り**: セットで賄えなかった商品を単品で加算

#### 戻り値

```js
{
  sets: [{ ...set, count, chosenSides }],  // 使用するセット
  singles: [{ ...item, count }],            // 単品注文
  total: number,                            // 最安合計金額
  singleOnly: number,                       // 全単品で注文した場合の合計
  savings: number,                          // 節約額（singleOnly - total）
}
```

### suggestAddition()

`suggestAddition(items, sets, qty, sideGroups)` で「追加するとお得になる商品」を最大3件返す。

- 候補: セットに含まれる商品（単品・ドリンクはサイズごとに1代表）
- 各候補を1個追加してoptimize()し、節約増加額（savingsGain）からアイテム価格を引いた `netCost` が低い順にソート
- ドリンクは `item.category === 'ドリンク'` で判定（IDサフィックスではない）

### suggestSizeChange()

`suggestSizeChange(items, sets, qty, sideGroups)` で「サイズ変更するとお得になる商品」を最大3件返す。

- カートのドリンク: 同一商品の他サイズへの変更を試みる（なければドリンクピッカーを表示）
- カートの非ドリンク: IDプレフィックスで別サイズを探索
- 変更後の `savingsGain > 0` かつ `netBenefit（= savingsGain - priceDiff）> 0` の場合のみ提案
- UIには「合計が○○円→△△円に」と表示（現在の `result.total` から `netBenefit` を引いた値）

---

## 提案機能（UI）

### 追加提案

- 「もっとお得にするには」セクションに最大3件表示
- 「追加」ボタンで対象メンバーのカートに追加
- ドリンクの場合はドリンクピッカー（S/M/Lから選択）を表示

### サイズ変更提案

- 「サイズ変更でお得に」セクションに最大3件表示
- 「変更」ボタンでカート内の該当アイテムをその場で置き換え（位置を保持）
- 同一商品の他サイズがない場合はドリンクピッカーを表示

### Undo

- 追加・変更ボタン実行後、1回だけ「元に戻す」が可能
- `previousCart` に変更前のカートを保存
- 手動操作（addToCart / changeQty / removeEntry / clearAll）で `previousCart` はクリア

---

## 画面構成

### ヘッダー

- ロゴ（SVG: KFC＋算）・アプリ名（まとめてケンタさん）・サブタイトル

### ステータス表示

- `loading`: スピナー
- `error`: エラーメッセージ＋再試行ボタン

### メインコンテンツ（2カラムグリッド、スマホは1カラム）

**左カード：注文を追加**
- メニュー更新日タグ
- アバター式メンバー選択
  - タップで選択、長押し（600ms）で名前変更・削除・カラー変更モード
  - ＋ボタンでメンバー追加
- 2ペイン商品セレクター
  - 左ペイン：カテゴリ選択（チキン／バーガー／サイド／ドリンク／キッズ）
  - 右ペイン：商品リスト（ドリンクはS/M/Lタブで絞り込み）
  - 期間限定商品は「限定」バッジを表示
  - 下部：選択商品名・数量調整（−/＋）・「追加」ボタン
- カートリスト（メンバーごとにグループ表示）
  - 商品名（期間限定は「限定」バッジ付き）・数量変更・×削除
  - スマホでカートが空のとき「使い方」ステップガイドを表示
- 「すべてクリア」ボタン

**右カード：最適な注文構成**
- タイトル横にランチトグル（ランチ ON/OFF）＋「10時〜15時」バッジ
- カートが空のとき：使い方ステップガイドを表示（PCのみ）
- 最適化結果
  - セット：名前・SET/ランチバッジ・固定アイテム・サイド選択内容・個数・金額
  - 単品：名前（期間限定は「限定」バッジ付き）・個数・金額
  - 合計金額
  - 節約額（または「単品注文が最安です」）
- 追加提案エリア（「もっとお得にするには」）
- サイズ変更提案エリア（「サイズ変更でお得に」）
- Undoバー（提案適用直後のみ表示）
- `isCalculating` 中は透明度を下げて表示

### フッター

- 「メニューを再読み込み」ボタン
- KFC公式メニューへのリンク

---

## 状態管理（App.jsx）

| 状態 | 型 | 初期値 | 永続化 |
|------|----|--------|--------|
| `members` | Member[] | `[{id:1, name:'メンバー1', colorIdx:0}]` | localStorage: `kenta-members` |
| `cart` | CartEntry[] | `[]` | localStorage: `kenta-cart` |
| `previousCart` | CartEntry[]\|null | null | なし（提案のundo用） |
| `activeDrinkPicker` | string\|null | null | なし（追加提案のドリンク選択） |
| `activeSizeChangePicker` | string\|null | null | なし（変更提案のドリンク選択） |
| `selectedMember` | number | 最初のメンバーのid | なし |
| `selectedItem` | string\|null | null | なし |
| `isLunch` | boolean | false | なし |
| `activeCat` | string | `'chicken'` | なし |
| `drinkSize` | string | `'S'` | なし |
| `selectorQty` | number | 1 | なし |
| `addingMember` | boolean | false | なし |
| `editingMemberId` | number\|null | null | なし |
| `editingName` | string | '' | なし |
| `editingColorIdx` | number | 0 | なし |
| `newMember` | string | '' | なし |

### 重要なmemo計算

- `qty`: カートからitemId別の合計数量を計算（`useDeferredValue`でdeferredCartを使用）
- `filteredSets`: ランチモードOFFのとき`lunch_`で始まるセットを除外
- `result`: `optimize()`の結果（items/filteredSets/qty/sideGroupsが変わると再計算）
- `additions`: `suggestAddition()`の結果
- `sizeChanges`: `suggestSizeChange()`の結果

---

## カラーテーマ（メンバー色）

6色のローテーション。`colorIdx` で決定（メンバー追加時に未使用の色を自動割り当て）。

```js
COLORS     = ['#378ADD','#1D9E75','#BA7517','#D4537E','#7F77DD','#D85A30']  // ボーダー
BG_COLORS  = ['#E6F1FB','#E1F5EE','#FAEEDA','#FBEAF0','#EEEDFE','#FAECE7'] // 背景
TEXT_COLORS= ['#0C447C','#085041','#633806','#72243E','#3C3489','#712B13'] // テキスト
```

---

## スコープ外（やらないこと）

- ユーザー認証・ログイン
- クラウド同期・バックエンド
- 注文履歴の保存
- プッシュ通知
- KFC公式APIとの連携（スクレイピング）
- 金額以外の最適化（カロリー等）

---

## 既知の問題・要調査

- [ ] `chooseSides` が同じ商品を複数カウントしてしまう可能性
- [ ] `rem[k]` が負になったとき単品でカバーできているか
- [ ] ランチセット以外のセットでも `freeGroups` が正しく動作するか
- [ ] 提案の `netBenefit` と実際の合計差分がずれるケースがある可能性
