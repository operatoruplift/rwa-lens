'use client';

import { useEffect, useRef, type ReactNode } from 'react';

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Enhances server-rendered content without taking control of native scrolling. */
export function ScrollExperience({ children, className, enabled }: { children: ReactNode; className: string; enabled: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stop = () => {};

    function configure() {
      stop();
      if (!root || preference.matches || !('IntersectionObserver' in window)) return;

      const hero = root.querySelector<HTMLElement>('[data-motion-hero]');
      const story = root.querySelector<HTMLElement>('[data-motion-story]');
      const scene = root.querySelector<HTMLElement>('[data-motion-scene]');
      const chapters = Array.from(root.querySelectorAll<HTMLElement>('[data-motion-chapter]'));
      const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
      const animations = new Map<Element, Animation>();
      let frame = 0;

      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          observer.unobserve(element);
          element.dataset.revealed = 'true';
          // Visibility is never dependent on JS or an observer callback. Animate
          // only the entrance; the underlying content is always fully readable.
          if (!element.animate || element.contains(document.activeElement)) continue;
          const animation = element.animate([
            { opacity: 0.16, transform: 'translate3d(0, 28px, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          ], { duration: 850, easing: 'cubic-bezier(.16, 1, .3, 1)' });
          animation.id = 'lens-reveal';
          animations.set(element, animation);
          animation.onfinish = () => animations.delete(element);
        }
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });

      for (const element of reveals) {
        if (element.getBoundingClientRect().top < window.innerHeight || element.dataset.revealed === 'true') {
          element.dataset.revealed = 'true';
        } else {
          observer.observe(element);
        }
      }

      function update() {
        frame = 0;
        const viewport = window.innerHeight;
        const mobile = window.innerWidth <= 780;
        // Read geometry before writing transforms; no layout-changing properties
        // or React renders occur while scrolling. The frame loop sleeps at rest.
        const heroRect = hero?.getBoundingClientRect();
        const storyRect = story?.getBoundingClientRect();
        const chapterTops = storyRect && storyRect.bottom > 0 && storyRect.top < viewport
          ? chapters.map(chapter => chapter.getBoundingClientRect().top) : [];

        if (hero && heroRect) {
          const progress = clamp(-heroRect.top / heroRect.height);
          hero.style.setProperty('--hero-depth', `${(progress * (mobile ? 35 : 90)).toFixed(2)}px`);
          hero.style.setProperty('--hero-copy', `${(progress * (mobile ? 12 : 36)).toFixed(2)}px`);
          hero.style.setProperty('--hero-opacity', String(1 - progress * 0.28));
        }
        if (scene && storyRect && chapterTops.length) {
          const progress = clamp((viewport * 0.6 - storyRect.top) / storyRect.height);
          scene.style.setProperty('--lens-turn', `${(progress * 105 - 24).toFixed(2)}deg`);
          scene.style.setProperty('--scan-y', `${(progress * 124 - 62).toFixed(2)}px`);
          let current = 0;
          chapterTops.forEach((top, index) => { if (top < viewport * 0.6) current = index; });
          scene.dataset.step = String(current + 1);
        }
      }

      function schedule() {
        if (!frame) frame = requestAnimationFrame(update);
      }

      function revealFocused(event: FocusEvent) {
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest<HTMLElement>('[data-reveal]');
        if (!target) return;
        animations.get(target)?.finish();
        observer.unobserve(target);
        target.dataset.revealed = 'true';
      }

      root.dataset.motion = 'active';
      update();
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      root.addEventListener('focusin', revealFocused);
      const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
      resizeObserver?.observe(root);

      stop = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        resizeObserver?.disconnect();
        animations.forEach(animation => animation.cancel());
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        root.removeEventListener('focusin', revealFocused);
        for (const property of ['--hero-depth', '--hero-copy', '--hero-opacity']) hero?.style.removeProperty(property);
        for (const property of ['--lens-turn', '--scan-y']) scene?.style.removeProperty(property);
        scene?.removeAttribute('data-step');
        root.dataset.motion = 'static';
      };
    }

    configure();
    preference.addEventListener('change', configure);
    return () => { stop(); preference.removeEventListener('change', configure); };
  }, [enabled]);

  return <div ref={rootRef} className={className} data-motion="static">{children}</div>;
}
