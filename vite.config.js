import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import projectTexts from './vite-plugin-projects.js'
import { readFileSync, writeFileSync } from 'fs'

// Подбор шкалы кеглей на /scale/: только на локальном dev-сервере страница читает и пишет
// переменные --ids__fs-* в css/settings.css. В сборке этого нет.
// GET — текущие значения, POST — тело { small, body, lead, sub, head, base } (числа, можно не все).
function scaleTuner() {
  const file = resolve(__dirname, 'css/settings.css')
  const ids = ['small', 'body', 'lead', 'sub', 'head', 'base']
  const re = (id) => new RegExp(`(--ids__fs-${id}:\\s*)([0-9.]+)(rem|em)?`)
  const read = () => {
    const css = readFileSync(file, 'utf8')
    return Object.fromEntries(ids.map((id) => [id, parseFloat(css.match(re(id))?.[2])]))
  }
  return {
    name: 'scale-tuner',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__scale', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(read()))
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const values = JSON.parse(body)
            let css = readFileSync(file, 'utf8')
            for (const [id, v] of Object.entries(values)) {
              if (!ids.includes(id) || typeof v !== 'number' || !(v >= 0.3 && v <= 4) || !re(id).test(css)) throw new Error('bad value')
              css = css.replace(re(id), (_, head, _old, unit) => head + String(Math.round(v * 1000) / 1000) + (unit || ''))
            }
            writeFileSync(file, css)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(read()))
          } catch {
            res.statusCode = 400
            res.end('bad request')
          }
        })
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), projectTexts(), scaleTuner()],
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
        privacy: resolve(__dirname, 'pinterest-mcp-privacy/index.html'),
        type: resolve(__dirname, 'type/index.html')
      }
    }
  }
})