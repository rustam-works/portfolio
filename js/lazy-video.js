// Видео как живые картинки: играют сами, без звука, но грузятся по мере прокрутки.
// У видео ниже первого экрана в HTML стоит preload="none" и нет autoplay:
// загрузку начинаем, когда до видео остаётся примерно экран,
// а играет видео, только пока оно на экране.

const videos = [...document.querySelectorAll('video')];

const near = new IntersectionObserver((entries) => {
  for (const { isIntersecting, target } of entries) {
    if (!isIntersecting) continue;
    near.unobserve(target);
    if (target.preload === 'none') {
      target.preload = 'auto';
      target.load();
    }
  }
}, { rootMargin: '100% 0px' });

const visible = new IntersectionObserver((entries) => {
  for (const { isIntersecting, target } of entries) {
    if (isIntersecting) {
      target.dataset.visible = '';
      target.play().catch(() => {}); // в режиме энергосбережения iOS автозапуск запрещён
    } else {
      delete target.dataset.visible;
      target.pause();
    }
  }
});

for (const video of videos) {
  near.observe(video);
  visible.observe(video);
}
