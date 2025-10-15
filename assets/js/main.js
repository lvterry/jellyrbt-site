document.addEventListener('DOMContentLoaded', () => {
  const track = document.querySelector('.rabbit-track');
  if (!track) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const buffer = 80;
  let rafId = null;
  let speed = 0;
  let currentX = 0;
  let trackWidth = track.offsetWidth;
  let lastTime = null;

  const pickTop = () => 16 + Math.random() * 32;

  const resetRun = () => {
    trackWidth = track.offsetWidth;
    speed = 140 + Math.random() * 110;
    currentX = window.innerWidth + trackWidth + buffer;
    track.style.transform = `translate3d(${currentX}px, 0, 0)`;
    track.style.setProperty('--rabbit-top', `${pickTop().toFixed(0)}px`);
    lastTime = null;
  };

  const step = (time) => {
    if (reduceMotion.matches) return;
    if (lastTime === null) lastTime = time;

    const delta = (time - lastTime) / 1000;
    lastTime = time;

    currentX -= speed * delta;
    track.style.transform = `translate3d(${Math.round(currentX)}px, 0, 0)`;

    if (currentX < -(trackWidth + buffer)) {
      resetRun();
      lastTime = time;
    }

    rafId = requestAnimationFrame(step);
  };

  const start = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (reduceMotion.matches) {
      track.style.transform = '';
      track.style.removeProperty('--rabbit-top');
      lastTime = null;
      return;
    }

    resetRun();
    rafId = requestAnimationFrame(step);
  };

  reduceMotion.addEventListener('change', start);
  window.addEventListener('resize', () => {
    trackWidth = track.offsetWidth;
  });

  start();
});
