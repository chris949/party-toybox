import { createRoot } from 'react-dom/client';
// 丸ゴシックを同梱する（Windows・Android でも同じ見た目に。使う文字の分だけ読み込まれる）
import '@fontsource/m-plus-rounded-1c/400.css';
import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import './styles/app.css';
import { App } from './app/App';
import { showError } from './app/store';

// 予期しないエラーを画面に出す（テストプレイで報告してもらえるように）
window.addEventListener('error', e => showError(e.message || String(e.error)));
window.addEventListener('unhandledrejection', e => showError(String(e.reason?.message ?? e.reason)));

createRoot(document.getElementById('app')!).render(<App />);
