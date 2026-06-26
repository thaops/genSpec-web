"use client";

import { useEffect, useRef, useState } from "react";

// Streaming-aware typewriter. Unlike useTypewriter (which restarts when `text`
// changes), this treats `target` as a GROWING string and smoothly catches up to
// it, revealing a few chars per tick. The further behind it is, the faster it
// reveals — so it never lags far behind a fast model, yet still feels "typed".
// Resets to empty when `target` shrinks (e.g. a new turn cleared it).
export function useSmoothStream(
  target: string,
  { speed = 16, minChars = 2 }: { speed?: number; minChars?: number } = {}
): string {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState("");
  const targetRef = useRef(target);
  targetRef.current = target;

  // Hard reset when the stream is cleared or replaced with a non-extending value.
  useEffect(() => {
    if (!target || !target.startsWith(shown)) setShown(target && reduced ? target : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => {
      setShown((cur) => {
        const tgt = targetRef.current;
        if (cur.length >= tgt.length) return cur;
        const behind = tgt.length - cur.length;
        // Cap at 5 chars/tick so even all-at-once text still animates visibly
        const step = Math.min(Math.max(minChars, Math.round(behind / 6)), 5);
        return tgt.slice(0, cur.length + step);
      });
    }, speed);
    return () => window.clearInterval(timer);
  }, [reduced, speed, minChars]);

  return reduced ? target : shown;
}

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
