// Тексты кейсов вписываются в HTML при сборке — см. vite-plugin-projects.js

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
