import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: '.', // Корень проекта здесь
  base: './', // Относительные пути для GitHub Pages
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),           // Главная (портфолио)
        pxltool: resolve(__dirname, 'pxltool/index.html'), // Инструмент
        cv: resolve(__dirname, 'cv/index.html')
      }
    }
  }
})