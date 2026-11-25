import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 새 버전 배포 시 다음 실행 때 자동으로 갱신
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg', 'harin.webmanifest', 'harin-icon.svg'],
      manifest: {
        name: '망포꿈수학 학사운영',
        short_name: '학사운영',
        description: '요일별 회차 계획과 수업 안내 달력 만들기',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#047857',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 파일(JS·CSS·폰트·아이콘)만 저장. Supabase 데이터 요청은 저장하지 않고 항상 서버에서 받음
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // /harin은 서버(vercel.json)가 harin.html을 준다(하린이 시간표 별도 앱 정보). 저장된 index.html로 대신하지 않게 뺀다
        navigateFallbackDenylist: [/^\/api/, /^\/harin/],
      },
    }),
    // harin.html에는 하린이 시간표 앱 정보만 남긴다(PWA 도구가 공부방 앱 정보를 모든 html에 넣기 때문)
    {
      name: 'harin-manifest-only',
      apply: 'build',
      enforce: 'post',
      closeBundle() {
        const file = resolve(import.meta.dirname, 'dist/harin.html');
        if (!existsSync(file)) return;
        const html = readFileSync(file, 'utf8').replace(/<link rel="manifest" href="\/manifest\.webmanifest"[^>]*>/, '');
        writeFileSync(file, html);
      },
    },
  ],
  build: {
    rollupOptions: {
      // 하린이 시간표 주소 /harin(SPEC_harin 2장)
      input: { main: 'index.html', harin: 'harin.html' },
    },
  },
  test: {
    environment: 'node',
  },
});
