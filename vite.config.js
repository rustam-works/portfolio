import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import projectTexts from './vite-plugin-projects.js'

export default defineConfig({
  plugins: [react(), projectTexts()],
  root: '.', // Корень проекта здесь
  base: './', // Относительные пути для GitHub Pages
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),           // Главная (портфолио)
        pxltool: resolve(__dirname, 'pxltool/index.html'), // Инструмент
        cv: resolve(__dirname, 'cv/index.html'),
        alchemy: resolve(__dirname, 'alchemy/index.html'),
        privacy: resolve(__dirname, 'pinterest-mcp-privacy/index.html')
      }
    }
  }
})