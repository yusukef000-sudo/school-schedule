// ===== Firebase設定 =====
// Firebase Console (https://console.firebase.google.com/) で
// プロジェクトを作成し、以下の値を自分のものに置き換えてください。
//
// 手順:
// 1. https://console.firebase.google.com/ にアクセス
// 2. 「プロジェクトを追加」→ 適当な名前（例: school-schedule）
// 3. 「ウェブアプリを追加」（</>アイコン）→ 適当な名前
// 4. 表示される firebaseConfig の値をここにコピー
// 5. 左メニュー「Realtime Database」→「データベースを作成」
// 6. ロケーション: asia-southeast1 等を選択
// 7. セキュリティルール: 「テストモードで開始」を選択
//    （後で下記のルールに変更推奨）

const firebaseConfig = {
  apiKey: "AIzaSyAkAeYqdja8nyj4ftxwp1IsU8Jmuto-f_M",
  authDomain: "schedule-management-gakuen.firebaseapp.com",
  databaseURL: "https://schedule-management-gakuen-default-rtdb.firebaseio.com",
  projectId: "schedule-management-gakuen",
  storageBucket: "schedule-management-gakuen.firebasestorage.app",
  messagingSenderId: "407213888946",
  appId: "1:407213888946:web:a2b4605e5c89eb652b00ab"
};

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ===== 推奨セキュリティルール =====
// Realtime Database のルールに以下を設定すると、
// 家族コードを知っている人だけがデータにアクセスできます:
//
// {
//   "rules": {
//     "families": {
//       "$familyCode": {
//         ".read": true,
//         ".write": true
//       }
//     }
//   }
// }
