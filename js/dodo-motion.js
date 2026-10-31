// Коллаж Dodo: «течение». Курсор и прокрутка слегка сносят предметы,
// каждый предмет — пружина с инерцией. Размах задан от ширины коллажа,
// а не от размера предмета, поэтому мелкие предметы двигаются так же заметно.
// Цикл анимации крутится, только пока что-то движется.

const collage = document.querySelector('.dodo-collage');
// Курсор ловим на всём блоке кейса: двигаются и предметы коллажа, и задние слайды деки
const stage = document.querySelector('.dodo-deck-visuals');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Не двигаются: листы (баллоны, съёмки) и передние карточки стопок
const STATIC = ['cylinders', 'shoots', 'vk_1', 'tv_revenue'];

const nameOf = (el) => {
  if (el.dataset.card) return 'smth_' + el.dataset.card;
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  return img ? img.getAttribute('src').split('/').pop().replace(/\.\w+$/, '') : null;
};

// Отдельным предметам — своя сила течения (1 — как у всех)
const GAIN = { football_cards: 0.3, keychain: 0.5 };

// Задние слайды деки: передний почти прикреплён к обложке, каждый следующий
// вглубь плывёт сильнее (по прозрачности слоя --a: 0.8 передний … 0.2 дальний)
const layerGain = (el) => 0.15 + (0.8 - parseFloat(el.style.getPropertyValue('--a'))) / 0.6 * 0.55;

// Случайные, но постоянные коэффициенты, чтобы прокрутка двигала всё вразнобой
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const items = [...collage.children, ...document.querySelectorAll('.dodo-deck-panel__layer')]
  .filter((el) => el.tagName !== 'svg' && nameOf(el) && !STATIC.includes(nameOf(el)))
  .map((el) => ({
    el, name: nameOf(el), frame: el.querySelector(':scope > .dodo-collage__shade-frame'),
    a: 0, w: 0, x: 0, y: 0, vx: 0, vy: 0,
    lag: 0.25 + rnd() * 0.75, spin: (rnd() - 0.5) * 2,
    gain: el.classList.contains('dodo-deck-panel__layer') ? layerGain(el) : GAIN[nameOf(el)] ?? 1,
    box: { l: 0, t: 0, w: 0, h: 0 },
  }));
const byName = Object.fromEntries(items.map((it) => [it.name, it]));

// Тени в стопках: рамка теней внутри нижней карточки получает обратную
// трансформацию карточки — тень остаётся под верхней карточкой, а обрезается
// краем нижней. Если верхняя карточка тоже двигается, её тень двигается с ней.
const shades = [...collage.querySelectorAll('.dodo-collage__shade')]
  .map((el) => ({ el, of: byName[el.dataset.of] }));

function measure() {
  for (const it of items) {
    const e = it.el;
    const p = e.offsetParent;
    it.box = { l: e.offsetLeft + p.offsetLeft, t: e.offsetTop + p.offsetTop, w: e.offsetWidth, h: e.offsetHeight };
  }
}
new ResizeObserver(measure).observe(stage);
items.forEach((it) => new ResizeObserver(measure).observe(it.el));

// Сила движения (всё в долях ширины коллажа W)
const T = {
  radius: 0.05,   // курсор задевает предмет с такого расстояния
  move: 0.0025,   // снос по ходу курсора
  turn: 0.035,    // разворот от прохода курсора сбоку от центра
  maxMove: 0.0025,// предел сноса
  maxTurn: 0.7,   // предел поворота, °
  scroll: 0.005,  // отставание при прокрутке
};

let last = null;
stage.addEventListener('pointermove', (ev) => {
  const r = stage.getBoundingClientRect();
  const px = ev.clientX - r.left, py = ev.clientY - r.top, t = ev.timeStamp;
  if (last && !reduce) {
    const dt = Math.max(1, (t - last.t) / 16.67);
    const vx = (px - last.x) / dt, vy = (py - last.y) / dt;
    const W = collage.clientWidth, R = W * T.radius;
    for (const it of items) {
      const b = it.box;
      const dx = Math.max(b.l - px, 0, px - (b.l + b.w));
      const dy = Math.max(b.t - py, 0, py - (b.t + b.h));
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      const f = (1 - d / R) * it.gain;
      const rx = Math.max(-1, Math.min(1, (px - (b.l + b.w / 2)) / (W * 0.1)));
      const ry = Math.max(-1, Math.min(1, (py - (b.t + b.h / 2)) / (W * 0.1)));
      it.vx += vx * T.move * f;
      it.vy += vy * T.move * f;
      it.w += T.turn * (rx * vy - ry * vx) / W * 60 * f;
    }
    wake();
  }
  last = { x: px, y: py, t };
});
stage.addEventListener('pointerleave', () => { last = null; });

// Прокрутка: каждый предмет отстаёт по-своему и чуть разворачивается
let lastScroll = scrollY;
addEventListener('scroll', () => {
  const d = scrollY - lastScroll;
  lastScroll = scrollY;
  if (reduce) return;
  const r = collage.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  const k = Math.max(-40, Math.min(40, d)) * T.scroll;
  for (const it of items) {
    it.vy -= k * it.lag * it.gain;
    it.w += k * it.spin * 0.04 * it.gain;
  }
  wake();
}, { passive: true });

let running = false, prev = 0;
function wake() {
  if (running) return;
  running = true;
  prev = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(3, (now - prev) / 16.67);
  prev = now;
  const W = collage.clientWidth, lim = W * T.maxMove;
  let energy = 0;
  for (const it of items) {
    const over = Math.abs(it.a) > T.maxTurn ? 6 : 1;
    it.w += (-0.012 * over * it.a - 0.11 * it.w) * dt;
    it.a += it.w * dt;
    it.vx += (-0.01 * it.x - 0.09 * it.vx) * dt;
    it.vy += (-0.01 * it.y - 0.09 * it.vy) * dt;
    it.x = Math.max(-lim, Math.min(lim, it.x + it.vx * dt));
    it.y = Math.max(-lim, Math.min(lim, it.y + it.vy * dt));
    energy += Math.abs(it.a) + Math.abs(it.w) + Math.abs(it.x) + Math.abs(it.y) + Math.abs(it.vx) + Math.abs(it.vy);
    it.el.style.transform = `translate(${it.x}px, ${it.y}px) rotate(${it.a}deg)`;
    if (it.frame) it.frame.style.transform = `rotate(${-it.a}deg) translate(${-it.x}px, ${-it.y}px)`;
  }
  for (const sh of shades) {
    if (sh.of) sh.el.style.transform = `translate(${sh.of.x}px, ${sh.of.y}px) rotate(${sh.of.a}deg)`;
  }
  if (energy > 0.02) requestAnimationFrame(frame);
  else {
    running = false;
    for (const it of items) { it.a = it.w = it.x = it.y = it.vx = it.vy = 0; }
  }
}

// Вспышка фотоаппарата на карточке съёмок: в покое видна как на макете,
// при проходе курсора один раз быстро гаснет и резко загорается.
// Чтобы до неё дотянуться, картинку съёмок подменяем на тот же SVG прямо в странице.
const shoots = collage.querySelector('.dodo-collage__item--shoots');
if (shoots && !reduce) {
  fetch(shoots.getAttribute('src')).then((r) => r.text()).then((text) => {
    const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    if (!svg.querySelector('.cam__flash')) return;
    svg.setAttribute('class', shoots.className);
    svg.setAttribute('style', shoots.getAttribute('style') + ';height:auto;aspect-ratio:276/194');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', shoots.alt);
    shoots.replaceWith(svg);
    const flash = svg.querySelector('.cam__flash');
    let flashing = null;
    svg.querySelector('.cam').addEventListener('pointerenter', () => {
      if (flashing && flashing.playState === 'running') return;
      flashing = flash.animate(
        [{ opacity: 1, easing: 'ease-out' }, { opacity: 0, offset: 0.999 }, { opacity: 1 }],
        { duration: 150 }
      );
    });
  }).catch(() => {});
}

measure();
