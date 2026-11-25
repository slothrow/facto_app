import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// /harin(하린이 시간표 홈 화면 아이콘)으로 열면 바로 하린이 시간표 화면으로
if (window.location.pathname.startsWith('/harin') && !window.location.hash) window.location.replace('#/harin');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
