'use client';

import { useEffect, useState } from 'react';

/**
 * Número que cuenta hacia arriba al montar (efecto tacómetro/odómetro).
 * Cierra con un ease-out cúbico. Respeta prefers-reduced-motion.
 */
export function CountUp({
  to,
  durationMs = 900,
  locale = 'es-ES',
}: {
  to: number;
  durationMs?: number;
  locale?: string;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    // Si el usuario prefiere menos movimiento, saltamos directo al valor final.
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setValue(to);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, durationMs]);

  return <>{value.toLocaleString(locale)}</>;
}
