# カレンダーアプリ

複数ユーザー対応のリアルタイムカレンダーアプリ。

## 必要なもの

- [Node.js](https://nodejs.org/) v18 以上

## 起動方法

### 1. サーバーの起動

```bash
cd server
npm install
npm run dev
```

サーバーは http://localhost:3001 で起動します。

### 2. クライアントの起動（別ターミナル）

```bash
cd client
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開いてください。

## 機能

- ユーザー登録 / ログイン
- 月・週・日ビューのカレンダー
- イベント作成・編集・削除（クリックまたは＋ボタン）
- 複数カレンダーの管理（色分け）
- カレンダーの共有（メールアドレスで招待）
  - **編集者**: イベントの追加・編集・削除が可能
  - **閲覧者**: イベントの閲覧のみ
- リアルタイム同期（Socket.io）

## ディレクトリ構成

```
calendar-app/
├── server/          # Node.js + Express + SQLite + Socket.io
│   └── src/
│       ├── index.ts        # サーバーエントリポイント
│       ├── db.ts           # データベース定義
│       ├── middleware/auth.ts
│       └── routes/
│           ├── auth.ts     # 認証 API
│           ├── calendars.ts # カレンダー API
│           └── events.ts   # イベント API
└── client/          # React + TypeScript + Vite
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── AuthPage.tsx
        │   ├── Sidebar.tsx
        │   ├── CalendarView.tsx
        │   ├── EventModal.tsx
        │   └── CalendarManager.tsx
        ├── hooks/
        │   ├── useAuth.ts
        │   └── useSocket.ts
        ├── api/client.ts
        └── types/index.ts
```
