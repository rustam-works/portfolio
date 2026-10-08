// Генеративная сетка кейса Alchemy: при каждом заходе работы раскладываются заново.
// В HTML у каждого блока есть статичное место (--c / --r) — это запасной вариант без JS.
//
// Сетка — фиксированный прямоугольник: 24 колонки × --rows рядов (задаётся в CSS).
// Алгоритм — упаковка «по линии горизонта» (skyline):
// 1. Блоки берутся в случайном порядке, у каждого несколько допустимых размеров
//    (в ячейках), близких к пропорции работы.
//    Широкую полосу леттерингов ставим первой у верхнего края,
//    а половину готовых раскладок потом переворачиваем по вертикали.
// 2. Каждый раз находим самую низкую «ямку» горизонта и подбираем в неё блок
//    и размер, которые закрывают её по ширине точнее всего (+ немного шума).
// 3. Низ подтягиваем до края: верхние блоки, которым до него не хватает
//    нескольких рядов, растягиваем.
// 4. Из множества таких раскладок берём ту, где меньше всего пустот.
// 5. Несколько случайных блоков сдвигаем на ячейку вверх или влево — наложения.
// Заодно перемешиваем порядок кадров в покадровых блоках (сплайны, dash queen).

const COLS = 24;

// Допустимые размеры [колонки, ряды] под пропорцию каждой работы
const SIZES = {
    belt: [[8, 8], [7, 7], [6, 6], [5, 5]],
    dash: [[5, 6], [4, 5], [6, 7]],
    turtle: [[4, 4], [5, 5], [6, 6]],
    barcode: [[4, 4], [5, 5], [6, 6]],
    halftone: [[4, 4], [5, 5], [6, 6]],
    ellipse: [[4, 4], [5, 5], [6, 6]],
    tangent: [[4, 4], [5, 5], [6, 6]],
    radial: [[4, 4], [5, 5], [6, 6]],
    // Сплайны и userdata держим небольшими
    splines: [[4, 5], [5, 5]],
    // Леттеринги — два ряда слов, пропорция ~2.6:1 (не уже — иначе ряд вылезет)
    lettering: [[14, 5], [11, 4], [16, 6]],
    foam: [[4, 7], [3, 5]],
    userdata: [[6, 4], [7, 5]],
    // Камера обратной перспективы — небольшим кусочком поверх раскладки (см. FLOATING)
    reverse: [[3, 3], [4, 4]],
};

// Блоки, которые не участвуют в упаковке, а кладутся поверх готовой раскладки
// туда, где закроют меньше всего чужих работ (охотнее всего — в пустоты).
// Так они не добавляют сетке высоты
const FLOATING = new Set(['reverse']);
// Работы, которые плавающий блок никогда не перекрывает
const NO_COVER = new Set(['lettering', 'dash', 'splines']);

// Сколько рядов можно добавить блоку, чтобы выровнять низ сетки.
// Укорачивать блоки нельзя — иначе работа обрезается по высоте
const MAX_STRETCH = 2;
// Блоки, которым растяжение ограничено: сплайны и userdata — чтобы не разрастались,
// tangent belt и ellipse — чтобы видео не обрезалось по бокам,
// леттеринги — чтобы ряды слов не вылезали за блок по ширине
const STRETCH_LIMIT = { splines: 1, userdata: 0, tangent: 0, ellipse: 0, lettering: 0 };
// Блоки шире стольких колонок ставятся в раскладку первыми
const WIDE = 10;
// Сколько блоков сдвигаем с места ради наложений
const OVERLAPS = 3;
// Сколько раскладок пробуем
const TRIES = 150;

const shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

function layout(keys, rows) {
    const sky = new Array(COLS).fill(0); // высота занятого столбца по каждой колонке
    const placed = [];
    let rest = shuffle(keys);

    // Широкие блоки (полоса леттерингов) ставим первыми у верхнего края в случайную
    // колонку — позже для них уже не найдётся такой широкой «ямки»
    for (const key of rest.filter((k) => Math.min(...SIZES[k].map(([w]) => w)) >= WIDE)) {
        const [w, h] = SIZES[key][Math.floor(Math.random() * SIZES[key].length)];
        const x = Math.floor(Math.random() * (COLS - w + 1));
        for (let i = x; i < x + w; i++) sky[i] = h;
        placed.push({ key, x, y: 0, w, h });
        rest = rest.filter((k) => k !== key);
    }

    const minArea = (key) => Math.min(...SIZES[key].map(([w, h]) => w * h));
    let used = placed.reduce((sum, item) => sum + item.w * item.h, 0);

    while (rest.length) {
        // Самая низкая «ямка» горизонта: подряд идущие колонки с минимальной высотой
        const y = Math.min(...sky);
        if (y >= rows) return null; // места не хватило
        const x0 = sky.indexOf(y);
        let x1 = x0;
        while (x1 < COLS && sky[x1] === y) x1++;
        const gap = x1 - x0;

        // Подбираем блок и размер, которые закрывают ямку по ширине точнее всего
        let best = null;
        const restMin = rest.reduce((sum, key) => sum + minArea(key), 0);
        for (const key of rest) {
            // Сколько площади останется, если остальные блоки возьмут минимальные размеры
            const slack = rows * COLS - used - (restMin - minArea(key));
            for (const [w, h] of SIZES[key]) {
                if (w > gap || y + h > rows || w * h > slack) continue;
                const score = gap - w + Math.random() * 2;
                if (!best || score < best.score) best = { key, w, h, score };
            }
        }

        if (!best) {
            // Ничего не влезает — засыпаем ямку до уровня ближайшего соседа (останется пустота)
            const left = x0 > 0 ? sky[x0 - 1] : Infinity;
            const right = x1 < COLS ? sky[x1] : Infinity;
            const level = Math.min(left, right, rows);
            for (let i = x0; i < x1; i++) sky[i] = level;
            continue;
        }

        // Если блок уже ямки — прижимаем его к случайному краю
        const x = Math.random() < 0.5 ? x0 : x1 - best.w;
        for (let i = x; i < x + best.w; i++) sky[i] = y + best.h;
        placed.push({ key: best.key, x, y, w: best.w, h: best.h });
        used += best.w * best.h;
        rest = rest.filter((key) => key !== best.key);
    }

    // Подтягиваем низ: блок, который сейчас верхний во всех своих колонках,
    // дотягиваем до нижнего края, если не хватает немного
    for (const item of placed) {
        const end = item.y + item.h;
        const limit = STRETCH_LIMIT[item.key] ?? MAX_STRETCH;
        const isTop = sky.slice(item.x, item.x + item.w).every((v) => v === end);
        if (isTop && rows - end > 0 && rows - end <= limit) {
            item.h = rows - item.y;
            for (let i = item.x; i < item.x + item.w; i++) sky[i] = rows;
        }
    }

    // Половину раскладок переворачиваем по вертикали — широкая полоса бывает и внизу
    if (Math.random() < 0.5) {
        for (const item of placed) item.y = rows - item.y - item.h;
    }

    const area = placed.reduce((sum, item) => sum + item.w * item.h, 0);
    return { placed, voids: rows * COLS - area };
}

// Из множества случайных раскладок берём ту, где меньше всего пустот.
// Часть попыток в прямоугольник не укладывается — пробуем, пока не наберём удачные
function pickLayout(keys, rows) {
    let best = null;
    for (let i = 0; i < TRIES * 10 && (!best || i < TRIES); i++) {
        const candidate = layout(keys, rows);
        if (candidate && (!best || candidate.voids < best.voids)) best = candidate;
    }
    return best?.placed ?? null;
}

// Наложения: сдвигаем несколько блоков на ячейку вверх или влево — в ту сторону,
// где перекрытие меньше (вверх перекрывается ширина блока, влево — высота) — и кладём сверху
function addOverlaps(placed) {
    const movable = shuffle(placed.filter((item) => item.y > 0 || item.x > 0));
    for (const item of movable.slice(0, OVERLAPS)) {
        const up = item.y > 0 ? item.w : Infinity;
        const left = item.x > 0 ? item.h : Infinity;
        if (up <= left) item.y -= 1;
        else item.x -= 1;
        item.z = 2;
    }
    return placed;
}

// Кладём плавающий блок поверх раскладки: перебираем все места и размеры,
// штраф — число перекрытых ячеек чужих работ (пустоты бесплатны), плюс немного шума
function addFloating(placed, key, rows) {
    const cover = Array.from({ length: rows }, () => new Array(COLS).fill(null));
    for (const item of placed) {
        for (let y = item.y; y < Math.min(rows, item.y + item.h); y++) {
            for (let x = item.x; x < item.x + item.w; x++) cover[y][x] = item.key;
        }
    }
    let best = null;
    for (const [w, h] of SIZES[key]) {
        for (let y = 0; y + h <= rows; y++) {
            for (let x = 0; x + w <= COLS; x++) {
                let covered = 0;
                let forbidden = false;
                for (let j = y; j < y + h && !forbidden; j++) {
                    for (let i = x; i < x + w; i++) {
                        const under = cover[j][i];
                        if (!under) continue;
                        if (NO_COVER.has(under)) { forbidden = true; break; }
                        covered++;
                    }
                }
                if (forbidden) continue;
                const score = covered / (w * h) + Math.random() * 0.3;
                if (!best || score < best.score) best = { key, x, y, w, h, score };
            }
        }
    }
    if (best) placed.push({ key, x: best.x, y: best.y, w: best.w, h: best.h, z: 3 });
    return placed;
}

function apply() {
    const grid = document.querySelector('.alchemy-grid');
    if (!grid) return;
    const figures = [...grid.querySelectorAll('.alchemy-item[data-key]')];
    const byKey = new Map(figures.map((el) => [el.dataset.key, el]));

    const rows = parseInt(getComputedStyle(grid).getPropertyValue('--rows'), 10);
    const keys = figures.map((el) => el.dataset.key).filter((key) => !FLOATING.has(key));
    let picked = null;
    for (let i = 0; i < 5 && !picked; i++) picked = pickLayout(keys, rows);
    if (!picked) return; // не уложилось — остаётся статичная раскладка из HTML
    const placed = addOverlaps(picked);
    for (const key of FLOATING) if (byKey.has(key)) addFloating(placed, key, rows);

    for (const { key, x, y, w, h, z } of placed) {
        const el = byKey.get(key);
        el.style.setProperty('--c', `${x + 1} / span ${w}`);
        el.style.setProperty('--r', `${y + 1} / span ${h}`);
        if (z) el.style.setProperty('--z', z);
        else el.style.removeProperty('--z');
    }

    // Порядок в DOM — тот же, что у раскладки: на телефоне сетка укладывается
    // автоматически по порядку, так и там каждый раз выходит новая последовательность
    for (const { key } of placed) grid.appendChild(byKey.get(key));
    // Перенос в DOM ставит видео на паузу — запускаем обратно
    grid.querySelectorAll('video').forEach((video) => video.play().catch(() => {}));
}

// Случайный порядок кадров: номер кадра в цикле задаёт --i (см. .alchemy-flip в CSS)
function shuffleFrames() {
    document.querySelectorAll('.alchemy-flip').forEach((flip) => {
        const frames = [...flip.querySelectorAll('img')];
        shuffle(frames.map((_, i) => i)).forEach((i, n) => frames[n].style.setProperty('--i', i));
    });
}

apply();
shuffleFrames();
