/**
 * VISUAL DISCOVERY TOOL (Infinite Speed Optimization)
 * Logic: Background Pre-fetching + Direct CORS where possible
 */

const UI = {
    btn: document.getElementById('ignite-btn'),
    grid: document.getElementById('grid-container'),
    loader: document.getElementById('loader')
};

// --- DATA CONFIGURATION ---
const PART_PREFIXES = ['STM32', 'ESP32', 'LM', 'TPS', 'MAX', 'ADS', 'INA', 'LTC', 'BME', 'V', 'SX', 'DRV', 'AT'];

// --- PRE-FETCHING ENGINE ---
let prefetchQueue = []; // Array of { token, items: [] }
let prefetchLock = false;

// --- UTILS ---
function rInt(min, max) { return Math.floor(Math.random() * (max - min) + min); }
function rChar() { return String.fromCharCode(97 + Math.floor(Math.random() * 26)); }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateToken() {
    const templates = [
        () => `${pickRandom(PART_PREFIXES)}${rInt(10, 9999)}`,
        () => `${rChar()}${rInt(100, 999)}-${rChar().toUpperCase()}`,
        () => `${rChar()}${rChar()}-${rInt(10, 99)}`,
        () => `${rInt(1, 9)}-${rInt(10, 99)}${rChar().toUpperCase()}${rChar().toUpperCase()}`
    ];
    return pickRandom(templates)();
}

// --- FETCHERS ---
const PROXY = 'https://api.allorigins.win/get?url=';

async function fetchJSON(url, useProxy = false) {
    try {
        const target = useProxy ? `${PROXY}${encodeURIComponent(url)}` : url;
        const res = await fetch(target);
        if (!res.ok) return null;
        const data = await res.json();
        return useProxy ? JSON.parse(data.contents) : data;
    } catch { return null; }
}

const Sources = {
    // iFixit: Native CORS supported
    async ifixit(query) {
        const data = await fetchJSON(`https://www.ifixit.com/api/2.0/search/${encodeURIComponent(query)}?type=guide`);
        if (!data?.results) return [];
        return data.results.slice(0, 5).map(g => ({
            source: 'iFixit / Tech',
            url: g.image?.original || g.image?.standard,
            title: g.title,
            link: g.url
        }));
    },
    // DDG: Needs Proxy
    async marketplace(query) {
        const data = await fetchJSON(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query + ' product')}&o=json`, true);
        if (!data?.results) return [];
        return data.results.slice(0, 15).map(r => ({
            source: 'Market / Web',
            url: r.image,
            title: r.title,
            link: r.url
        }));
    },
    // Archive: Native CORS supported
    async archive(query) {
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query + ' AND mediatype:image')}&fl[]=identifier&fl[]=title&rows=10&output=json&sort[]=random`;
        const data = await fetchJSON(url);
        if (!data?.response?.docs) return [];
        return data.response.docs.map(doc => ({
            source: 'Archive / Tech',
            url: `https://archive.org/services/img/${doc.identifier}`,
            title: doc.title,
            link: `https://archive.org/details/${doc.identifier}`
        }));
    },
    // Wiki: Native CORS supported
    async wiki(query) {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|extmetadata&format=json&origin=*`;
        const data = await fetchJSON(url);
        if (!data?.query?.pages) return [];
        return Object.values(data.query.pages).map(p => ({
            source: 'Wikimedia',
            url: p.imageinfo?.[0]?.url,
            title: p.title?.replace("File:", ""),
            link: p.imageinfo?.[0]?.descriptionurl
        }));
    }
};

// --- PRE-FETCHING LOGIC ---

async function backgroundPrewarm() {
    if (prefetchQueue.length > 3 || prefetchLock) return;
    prefetchLock = true;

    const token = generateToken();
    const batch = { token, items: [] };

    // Fetch all for this token in parallel
    const results = await Promise.allSettled(Object.keys(Sources).map(s => Sources[s](token)));
    results.forEach(r => {
        if (r.status === 'fulfilled') batch.items = [...batch.items, ...r.value];
    });

    if (batch.items.length > 0) {
        prefetchQueue.push(batch);
    }

    prefetchLock = false;
    // Chain unless full
    setTimeout(backgroundPrewarm, 500);
}

// --- ORCHESTRATION ---

async function executeDiscovery() {
    // 1. Check if we have a pre-fetched batch
    if (prefetchQueue.length > 0) {
        const batch = prefetchQueue.shift();
        UI.btn.innerText = batch.token;
        UI.grid.innerHTML = '';
        render(batch.items);
        UI.loader.classList.add('hidden');
        // Start filling queue again
        backgroundPrewarm();
        return;
    }

    // 2. Fallback (if queue is empty or first run)
    UI.loader.classList.remove('hidden');

    // Check if the current button text is a placeholder, if so generate fresh
    let currentToken = UI.btn.innerText;
    if (currentToken === '???' || currentToken === 'DSC_0000') {
        currentToken = generateToken();
        UI.btn.innerText = currentToken;
    }

    UI.grid.innerHTML = '';

    // Normal fetch
    const results = await Promise.allSettled(Object.keys(Sources).map(s => Sources[s](currentToken)));
    let all = [];
    results.forEach(r => { if (r.status === 'fulfilled') all = [...all, ...r.value]; });

    render(all);
    UI.loader.classList.add('hidden');

    // Post-load: Start pre-warming
    backgroundPrewarm();
}

function render(items) {
    shuffle(items);
    if (!items || items.length === 0) {
        // If nothing found for this token, try to prewarm more and maybe auto-retry or show nothing
        return;
    }
    items.forEach(item => {
        if (!item.url) return;
        // Optimization Proxy (wsrv.nl is extremely fast global CDN)
        const optimizedUrl = `https://wsrv.nl/?url=${encodeURIComponent(item.url)}&w=1000&q=85&output=webp`;

        const el = document.createElement('div');
        el.className = 'grid-item';
        el.innerHTML = `
            <a href="${item.link}" target="_blank">
                <img src="${optimizedUrl}" alt="${item.title}" loading="lazy" onerror="this.closest('.grid-item').remove()">
            </a>
            <div class="caption-overlay">
                <div class="item-meta">
                    <span class="badg">[${item.source.split(' ')[0]}]</span> ${item.title.substring(0, 40)}
                </div>
            </div>
        `;
        UI.grid.appendChild(el);
    });
}

// EVENTS
UI.btn.addEventListener('click', executeDiscovery);

// BOOTSTRAP
window.addEventListener('load', () => {
    // Initial load: Try to pre-warm first, or just hit once
    backgroundPrewarm();
    executeDiscovery();
});
