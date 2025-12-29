/**
 * VISUAL DISCOVERY TOOL (V3 - Multi-Token Mix)
 * Logic: Mixed random queries for a dense, diverse tech grid.
 */

const UI = {
    btn: document.getElementById('ignite-btn'),
    grid: document.getElementById('grid-container'),
    loader: document.getElementById('loader')
};

const PART_PREFIXES = ['STM32', 'ESP32', 'LM', 'TPS', 'MAX', 'ADS', 'INA', 'LTC', 'BME', 'V', 'SX', 'DRV', 'AT', 'BC', '2N', 'NE'];

// --- PRE-FETCHING ENGINE (V3 Mix) ---
let prefetchPool = []; // Flattened pool of diverse items
let isPrewarming = false;

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
    async ifixit(query) {
        // iFixit is naturally safe
        const data = await fetchJSON(`https://www.ifixit.com/api/2.0/search/${encodeURIComponent(query)}?type=guide`);
        if (!data?.results) return [];
        return data.results.slice(0, 5).map(g => ({
            source: 'iFixit',
            // Prefer original or standard
            url: g.image?.original || g.image?.standard,
            title: g.title,
            link: g.url
        }));
    },
    async marketplace(query) {
        // Anchor Web search with industrial hardware terms - this is the "Google alternative"
        const filteredQuery = `${query} electronic hardware component -book -movie -religion -manuscript`;
        const data = await fetchJSON(`https://duckduckgo.com/i.js?q=${encodeURIComponent(filteredQuery)}&o=json`, true);
        if (!data?.results) return [];
        return data.results.slice(0, 15).map(r => ({
            source: 'Market/Web',
            url: r.image,
            title: r.title,
            link: r.url
        }));
    },
    async archive(query) {
        // CRITICAL: Exclude 'texts' to avoid religious books. Anchor to 'hardware' or 'schematic'.
        // We use -mediatype:texts to kill the book results.
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query + ' AND (subject:hardware OR subject:electronics OR subject:machinery) AND -mediatype:texts AND -subject:religion')}&fl[]=identifier&fl[]=title&rows=15&output=json&sort[]=random`;
        const data = await fetchJSON(url);
        if (!data?.response?.docs) return [];
        return data.response.docs.map(doc => {
            const id = doc.identifier;
            return {
                source: 'Archive',
                /**
                 * Archive Quality Hack:
                 * services/img is a thumb.
                 * We try to use the 'download' path which is usually the original file.
                 * Most image-only items have an original .jpg matching the ID.
                 */
                url: `https://archive.org/download/${id}/${id}.jpg`,
                fallbackUrl: `https://archive.org/services/img/${id}`, // Fallback in render for 404s
                title: doc.title,
                link: `https://archive.org/details/${id}`
            };
        });
    },
    async wiki(query) {
        // Anchor Wikipedia search to technology/electronics
        const dataQuery = `${query} electronics equipment`;
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(dataQuery)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|extmetadata&format=json&origin=*`;
        const data = await fetchJSON(url);
        if (!data?.query?.pages) return [];
        return Object.values(data.query.pages).map(p => ({
            source: 'Wiki',
            url: p.imageinfo?.[0]?.url,
            title: p.title?.replace("File:", ""),
            link: p.imageinfo?.[0]?.descriptionurl
        }));
    }
};

// --- MULTI-TOKEN AGGREGATOR ---

async function prewarmDiversePool() {
    if (prefetchPool.length > 500 || isPrewarming) return;
    isPrewarming = true;

    const tokens = [generateToken(), generateToken(), generateToken(), generateToken()];

    const tasks = tokens.flatMap(token =>
        Object.keys(Sources).map(s => {
            const query = (s === 'marketplace' ? `${token} electronic hardware component -book -movie -religion -manuscript` :
                s === 'archive' ? `${token} AND (subject:hardware OR subject:electronics OR subject:machinery) AND -mediatype:texts AND -subject:religion` :
                    s === 'wiki' ? `${token} electronics equipment` : token);

            return Sources[s](token).then(res => {
                logSearch(query, s, res?.length || 0);
                return res;
            });
        })
    );

    const results = await Promise.allSettled(tasks);
    results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
            prefetchPool = [...prefetchPool, ...r.value];
        }
    });

    isPrewarming = false;
    setTimeout(prewarmDiversePool, 1000);
}

// --- DEBUG LOGGING ---
const SEARCH_LOG = [];
function logSearch(token, source, count) {
    if (!UI.log) {
        UI.log = document.createElement('div');
        UI.log.className = 'debug-log';
        document.body.appendChild(UI.log);
    }
    const entry = { time: new Date().toLocaleTimeString().split(' ')[0], token, source, count };
    SEARCH_LOG.unshift(entry);
    if (SEARCH_LOG.length > 15) SEARCH_LOG.pop();

    UI.log.innerHTML = SEARCH_LOG.map(e => `
        <div class="log-entry">[${e.time}] ${e.token.substring(0, 10)}.. > ${e.source} (${e.count})</div>
    `).join('');
}

// --- ORCHESTRATION ---

async function executeDiscovery() {
    UI.grid.innerHTML = '';
    UI.loader.classList.remove('hidden');

    if (prefetchPool.length > 30) {
        const batch = prefetchPool.splice(0, 100);
        render(batch);
        UI.loader.classList.add('hidden');
        prewarmDiversePool();
        return;
    }

    const immediateTokens = [generateToken(), generateToken(), generateToken()];

    const immediateTasks = immediateTokens.flatMap(token =>
        Object.keys(Sources).map(s => {
            const query = (s === 'marketplace' ? `${token} electronic hardware component -book -movie -religion -manuscript` :
                s === 'archive' ? `${token} AND (subject:hardware OR subject:electronics OR subject:machinery) AND -mediatype:texts AND -subject:religion` :
                    s === 'wiki' ? `${token} electronics equipment` : token);

            return Sources[s](token).then(res => {
                logSearch(query, s, res?.length || 0);
                return res;
            });
        })
    );

    const results = await Promise.allSettled(immediateTasks);
    let all = [];
    results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
            all = [...all, ...r.value];
        }
    });

    render(all);
    UI.loader.classList.add('hidden');
    prewarmDiversePool();
}

function render(items) {
    shuffle(items);
    items.forEach(item => {
        if (!item.url) return;

        // High Quality Proxying
        const optimizedUrl = `https://wsrv.nl/?url=${encodeURIComponent(item.url)}&w=1200&q=90&output=webp`;

        const el = document.createElement('div');
        el.className = 'grid-item';

        /**
         * Archive 404 Recovery:
         * If the high-res URL (Guess) fails, we fall back to the safe thumbnail.
         */
        const errorHandler = item.source === 'Archive'
            ? `this.src='https://wsrv.nl/?url=${encodeURIComponent(item.fallbackUrl)}&w=1200&q=90&output=webp';this.onerror=function(){this.closest('.grid-item').remove()}`
            : `this.closest('.grid-item').remove()`;

        el.innerHTML = `
            <a href="${item.link}" target="_blank">
                <img src="${optimizedUrl}" alt="${item.title}" loading="lazy" onerror="${errorHandler}">
            </a>
            <div class="caption-overlay">
                <div class="item-meta">
                    <span class="badg">[${item.source}]</span> ${item.title.substring(0, 40)}
                </div>
            </div>
        `;
        UI.grid.appendChild(el);
    });
}

UI.btn.addEventListener('click', executeDiscovery);

window.addEventListener('load', () => {
    prewarmDiversePool().then(() => {
        executeDiscovery();
    });
});
