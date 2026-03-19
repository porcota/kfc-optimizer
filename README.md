# ケンタ賢者

KFCの注文を賢く最安値で。単品・数量を入力すると、セットと単品の最安の組み合わせを自動計算します。

🌐 **公開URL**: https://porcota.github.io/kfc-optimizer/

## 機能

- 家族・グループのメンバーごとに注文を入力
- セット＋単品の全組み合わせを総当たりで最安構成を計算
- ランチメニュー（〜15時）の切り替え対応
- メニューデータはGoogleスプレッドシートから自動取得
- スマホ・PC両対応（レスポンシブ）
- 注文内容をブラウザに自動保存（localStorage）

## ローカルで動かす

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く。

## デプロイ

GitHubにpushすると GitHub Actions が自動でビルド＆デプロイします。

```bash
git add .
git commit -m "変更内容"
git push
```

## メニューデータの更新

価格改定やメニュー変更があったときはGoogleスプレッドシートを直接編集してください。
アプリ起動時に自動取得するためコードの変更は不要です。

**スプレッドシート（要権限）**:
https://docs.google.com/spreadsheets/d/e/2PACX-1vTT85tRBx7y35J0cQcaxIlwDApiBOpHaRbLHev_fCMSOs-tGN3qJ1iCQknvY5H_gA/

### シート構成

| シート | 内容 |
|---|---|
| 単品 | 商品名・id・価格 |
| セット | セット名・id・価格・含まれる単品 |
| サイドグループ | トクトクパックなどの自由選択サイドの定義 |

### セット内容の記法

- 固定アイテム: `id:数量`（例: `fillet:1`）
- 自由選択: `@グループid:数量`（例: `@chicken:2, @potato:1`）
- ランチメニューのid: `lunch_` プレフィックス

## 技術スタック

- React + Vite
- GitHub Pages（ホスティング）
- Google スプレッドシート（メニューデータ）
