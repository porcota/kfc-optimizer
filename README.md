# まとめてケンタさん

みんなの注文、最安セットで。家族やグループのメンバーごとに注文を入力すると、セットと単品の最安の組み合わせを自動計算します。

🌐 **公開URL**: https://porcota.github.io/kentasan/

## 機能

- メンバーごとに注文を入力（色分けアバターで管理）
- セット＋単品の全組み合わせを総当たりで最安構成を計算
- ランチメニュー（10時〜15時）の切り替え対応
- 期間限定商品は「限定」バッジで表示
- もっとお得にするための追加・サイズ変更の提案（1回のundo対応）
- スマホ・PC両対応（レスポンシブ）
- 注文内容をブラウザに自動保存（localStorage）
- PWA対応（ホーム画面に追加可能）

## ローカルで動かす

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173/kentasan/ を開く。

## デプロイ

GitHubにpushすると GitHub Actions が自動でビルド＆デプロイします。

```bash
git add .
git commit -m "変更内容"
git push
```

## メニューデータの更新

価格改定やメニュー変更があったときは `public/menu.json` を直接編集してください。

### menu.json の構造

```json
{
  "updated": "YYYY/MM/DD",
  "items": [
    { "id": "chicken_original", "name": "オリジナルチキン 1ピース", "price": 310, "category": "チキン" }
  ],
  "sets": [
    {
      "id": "set_id",
      "name": "セット名",
      "price": 1000,
      "contains": { "item_id": 1 },
      "freeGroups": [{ "groupId": "chicken", "count": 1 }]
    }
  ],
  "sideGroups": {
    "chicken": [{ "itemId": "chicken_original", "extra": 0 }]
  }
}
```

### セット内容の記法（contains / freeGroups）

- 固定アイテム: `contains` に `{ "item_id": 数量 }` で記述
- 自由選択: `freeGroups` に `{ "groupId": "グループid", "count": 数量 }` で記述

## 技術スタック

- React + Vite
- GitHub Pages（ホスティング）
- `public/menu.json`（メニューデータ）
