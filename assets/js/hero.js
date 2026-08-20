/* Jelly Rabbit hero — pointer tilt + poke on the mark.
   Motion values (durations, easings, tilt) live in styles.css; this file
   only drives the two custom properties the tilt transform reads.
   Reduced-motion users get no wiring; the CSS disables all motion. */
(function () {
    'use strict';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var mark = document.querySelector('.hero-mark');
    var tilt = document.querySelector('.hero-mark-tilt');
    if (!mark || !tilt) return;

    // Pointer tilt — fine pointers only; the mark gently follows the cursor.
    if (window.matchMedia('(pointer: fine)').matches) {
        var onMove = function (e) {
            var nx = (e.clientX / window.innerWidth) * 2 - 1;
            var ny = (e.clientY / window.innerHeight) * 2 - 1;
            tilt.style.setProperty('--nx', nx.toFixed(3));
            tilt.style.setProperty('--ny', ny.toFixed(3));
        };
        var onLeave = function () {
            tilt.style.setProperty('--nx', '0');
            tilt.style.setProperty('--ny', '0');
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseleave', onLeave);
    }

    // Poke — a jelly squish on press; works on touch and mouse.
    mark.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (tilt.classList.contains('is-poking')) return;
        tilt.classList.add('is-poking');
        tilt.addEventListener('animationend', function () {
            tilt.classList.remove('is-poking');
        }, { once: true });
    });
})();
