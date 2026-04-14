import { defineConfig } from 'vite';

// Для GitHub Pages в подпапке репозитория замените на '/имя-репо/'
// Например: base: '/planer/'
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
});
