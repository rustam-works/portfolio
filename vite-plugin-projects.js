// Тексты кейсов из data/projects.json вписываются прямо в HTML — и в dev, и в сборке,
// чтобы их видели поисковики и ИИ-ассистенты, которые не запускают скрипты.
// В каждом блоке [data-project] заполняются пустые заголовок и описание,
// а цифры (stats) добавляются в конец блока.
import { readFileSync } from 'fs'
import { resolve } from 'path'

const file = resolve(__dirname, 'data/projects.json')

// Позиция сразу за закрывающим тегом элемента, который открывается в позиции start
function closingEnd(html, start, tag) {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g')
  re.lastIndex = start
  let depth = 0
  for (let m; (m = re.exec(html));) {
    depth += m[0][1] === '/' ? -1 : 1
    if (depth === 0) return m.index + m[0].length
  }
  return -1
}

function fill(html, projects) {
  const re = /<(\w+)[^>]*\bdata-project="([^"]+)"[^>]*>/g
  let out = ''
  let pos = 0
  for (let m; (m = re.exec(html));) {
    const data = projects[m[2]]
    const end = closingEnd(html, m.index, m[1])
    if (!data || end < 0) continue
    let block = html.slice(m.index, end)

    const title = data.titleUrl
      ? `<a href="${data.titleUrl}" target="_blank" rel="noopener">${data.title}</a>`
      : data.title
    block = block.replace(/(<(h\d) class="case-study__title[^"]*">)(<\/\2>)/, `$1${title}$3`)
    if (data.description) {
      block = block.replace(/(<p class="case-study__description[^"]*">)(<\/p>)/, `$1${data.description}$2`)
    }
    if (data.stats?.length) {
      const stats = data.stats.map((s) =>
        `<div class="case-study__stat">
                <span class="case-study__stat-value">${s.value}</span>
                <span class="case-study__stat-label ids__footnote">${s.label}</span>
            </div>`).join('')
      const close = block.lastIndexOf('</')
      block = block.slice(0, close) + `<div class="case-study__stats">${stats}</div>` + block.slice(close)
    }
    out += html.slice(pos, m.index) + block
    pos = end
    re.lastIndex = end
  }
  return out + html.slice(pos)
}

export default function projectTexts() {
  return {
    name: 'project-texts',
    transformIndexHtml(html) {
      if (!html.includes('data-project=')) return html
      return fill(html, JSON.parse(readFileSync(file, 'utf8')))
    },
    // Правка текстов в dev сразу перезагружает страницу
    handleHotUpdate({ file: changed, server }) {
      if (changed === file) server.ws.send({ type: 'full-reload' })
    },
  }
}
