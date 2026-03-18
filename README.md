# KFC セット最適化計算機

単品の数量を選ぶと、最安の注文構成（セット＋単品の組み合わせ）を自動で計算します。
メニューデータはGoogleスプレッドシートから自動取得します。

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く。

## ビルド（公開用）

```bash
npm run build
```

`dist/` フォルダが生成されます。

## Vercel / Netlify / Cloudflare Pages へのデプロイ

1. このフォルダをGitHubリポジトリにpush
2. 各サービスでリポジトリを連携
3. ビルドコマンド: `npm run build`
4. 出力ディレクトリ: `dist`

## メニューデータの更新

価格が変わったときはGoogleスプレッドシートを直接編集してください。
アプリはスプレッドシートからリアルタイムで取得するため、コードの変更は不要です。

スプレッドシート:
https://docs.google.com/spreadsheets/d/e/2PACX-1vTT85tRBx7y35J0cQcaxIlwDApiBOpHaRbLHev_fCMSOs-tGN3qJ1iCQknvY5H_gA/
