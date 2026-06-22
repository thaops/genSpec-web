"use client";

import { useEffect, useState } from "react";

// Respect the user's reduced-motion preference (gates heavy animations).
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

// Typewriter effect — gradually reveals `text`. Returns the partial string and
// a `done` flag. When `enabled` is false (or reduced motion), reveals instantly.
export function useTypewriter(
  text: string,
  { enabled = true, speed = 14 }: { enabled?: boolean; speed?: number } = {}
): { shown: string; done: boolean } {
  const reduced = usePrefersReducedMotion();
  const animate = enabled && !reduced;
  const [shown, setShown] = useState(animate ? "" : text);
  const [done, setDone] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(text);
      setDone(true);
      return;
    }
    let i = 0;
    const step = Math.max(1, Math.round(text.length / 240));
    const timer = window.setInterval(() => {
      i = Math.min(text.length, i + step);
      setShown(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(timer);
        setDone(true);
      }
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, animate, speed]);

  return { shown, done };
}

// Staggered reveal — returns how many items of `count` are currently visible,
// incrementing one per `interval` ms. Instant when reduced motion is on.
export function useStaggerReveal(
  count: number,
  { interval = 90, enabled = true }: { interval?: number; enabled?: boolean } = {}
): number {
  const reduced = usePrefersReducedMotion();
  const animate = enabled && !reduced;
  const [visible, setVisible] = useState(animate ? 0 : count);

  useEffect(() => {
    if (!animate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(count);
      return;
    }
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      setVisible(n);
      if (n >= count) window.clearInterval(timer);
    }, interval);
    return () => window.clearInterval(timer);
  }, [count, interval, animate]);

  return visible;
}

// Cycles through indices [0, length) every `interval` ms (for rotating status
// lines while waiting). Pass `active=false` to pause and reset to 0.
export function useCycle(
  length: number,
  { interval = 1600, active = true }: { interval?: number; active?: boolean } = {}
): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active || length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % length);
    }, interval);
    return () => window.clearInterval(timer);
  }, [active, length, interval]);

  return active && length > 0 ? index % length : 0;
}
