import { defineConfig } from 'vite';

// GitHub Pages などのサブディレクトリ配信を想定して相対パスで出力する。
// 既存プロジェクトのビルド設定には一切触れない（このファイルは blast-block 専用）。
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
  server: { host: true, port: 5173 },
});
