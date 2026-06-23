# 平田和月の情シスノート

Markdownで記事を書いて、静的HTMLとして公開する個人ブログです。

## 書き方

1. `content/posts/` に `.md` ファイルを追加します。
2. 先頭に次のメタ情報を書きます。

```md
---
title: "記事タイトル"
date: "2026-06-23"
excerpt: "一覧に出す短い説明"
tags: ["情シス", "セキュリティ"]
---
```

3. 本文は普通のMarkdownで書きます。

## 確認

```bash
npm run build
npm run serve
```

`dist/` の中身をGitHub Pages、Cloudflare Pages、Netlifyなどに置けば公開できます。サーバー、DB、ログイン画面を持たない構成なので、運用費と攻撃面を小さくできます。

## 無料で公開する

### GitHub Pages

1. GitHubで `watsuki-blog` という新しい公開リポジトリを作ります。
2. このフォルダをリポジトリにpushします。
3. GitHubの `Settings` → `Pages` → `Build and deployment` で `GitHub Actions` を選びます。
4. `main` ブランチにpushすると、自動で `dist/` が公開されます。

GitHub Pagesは公開リポジトリなら無料で使えます。独自ドメインなしなら `https://<ユーザー名>.github.io/watsuki-blog/` で公開されます。

### Cloudflare Pages

1. Cloudflare PagesでGitHubリポジトリを接続します。
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Root directory: 空欄

Cloudflare Pagesでは `public/_headers` からセキュリティヘッダーを配信できます。独自ドメインやCloudflare Web Analyticsを使いたい場合はこちらが扱いやすいです。

## おすすめ運用

- リポジトリはGitHubに置く
- 公開はCloudflare PagesかGitHub Pages
- 独自ドメインを使う場合はCloudflare DNS
- 問い合わせフォームは置かず、必要ならメールリンクだけ
- 解析は入れないか、入れるならCloudflare Web Analytics
