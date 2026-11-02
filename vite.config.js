import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import projectTexts from './vite-plugin-projects.js'

export default defineConfig({
  plugins: [react(), projectTexts()],
  root: '.', // Корень проекта здесь
  base: '/', // Сайт стоит в корне домена; абсолютные пути нужны странице 404 на вложенных адресах
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),           // Главная (портфолио)
        pxltool: resolve(__dirname, 'pxltool/index.html'), // Инструмент
        cv: resolve(__dirname, 'cv/index.html'),
        notFound: resolve(__dirname, '404.html'),
        alchemy: resolve(__dirname, 'alchemy/index.html'),
        privacy: resolve(__dirname, 'pinterest-mcp-privacy/index.html')
      }
    }
  }
})