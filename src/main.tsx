import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './app/App';
import { showError } from './app/store';

// 予期しないエラーを画面に出す（テストプレイで報告してもらえるように）
window.addEventListener('error', e => showError(e.message || String(e.error)));
window.addEventListener('unhandledrejection', e => showError(String(e.reason?.message ?? e.reason)));

createRoot(document.getElementById('app')!).render(<App />);
