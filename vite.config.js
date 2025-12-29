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
        pxltool_color: resolve(__dirname, 'pxltool_color/index.html'),
        cv: resolve(__dirname, 'cv/index.html'),
        visual_search: resolve(__dirname, 'visual-search/index.html'),
        visual_search_v3: resolve(__dirname, 'visual-search-v3/index.html')
      }
    }
  }
})