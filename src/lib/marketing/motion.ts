import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export function subtleReveal(_node: Element, options: { delay?: number; distance?: number } = {}): TransitionConfig {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay = reducedMotion ? 0 : (options.delay ?? 0);
  const distance = options.distance ?? 14;

  return {
    delay,
    duration: reducedMotion ? 0 : 520,
    easing: cubicOut,
    css: (progress) => {
      const inverse = 1 - progress;
      return `opacity: ${progress}; transform: translateY(${inverse * distance}px);`;
    }
  };
}
