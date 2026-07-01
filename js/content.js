import projects from '../data/projects.json';

document.querySelectorAll('[data-project]').forEach(container => {
    const id = container.dataset.project;
    const data = projects[id];
    if (!data) return;

    const titleEl = container.querySelector('.case-study__title');
    if (titleEl) {
        titleEl.innerHTML = data.titleUrl
            ? `<a href="${data.titleUrl}" target="_blank">${data.title}</a>`
            : data.title;
    }

    const descEl = container.querySelector('.case-study__description');
    if (descEl) descEl.innerHTML = data.description;

    if (data.stats?.length) {
        const stats = document.createElement('div');
        stats.className = 'case-study__stats';
        stats.innerHTML = data.stats.map(s =>
            `<div class="case-study__stat">
                <span class="case-study__stat-value">${s.value}</span>
                <span class="case-study__stat-label ids__footnote">${s.label}</span>
            </div>`
        ).join('');
        container.appendChild(stats);
    }
});

// Скорость видео Aurora — по-клипно через data-speed (playbackRate нельзя задать атрибутом в HTML)
document.querySelectorAll('.aurora-case__video').forEach(video => {
    const speed = parseFloat(video.dataset.speed) || 1;
    video.playbackRate = speed;
    // playbackRate сбрасывается при (пере)загрузке источника — выставляем заново
    video.addEventListener('loadstart', () => { video.playbackRate = speed; });
});

// Прячем плавающую кнопку CTA, когда контакты уже на экране
const cta = document.querySelector('.ids__cta');
const contacts = document.querySelector('#contacts');
if (cta && contacts) {
    new IntersectionObserver(([entry]) => {
        cta.classList.toggle('is-hidden', entry.isIntersecting);
    }).observe(contacts);
}
