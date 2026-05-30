'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pause, Play, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Geometría del anillo del gauge.
const R = 46;
const CIRC = 2 * Math.PI * R; // circunferencia

/**
 * Timer de descanso como GAUGE RADIAL flotante — el momento "instrumento" de la
 * app. El anillo se vacía conforme corre la cuenta atrás; al entrar en los
 * últimos 10s vira al acento secundario del tema (rojo redline / magenta) y
 * pulsa, para crear urgencia.
 *
 * Self-contained: gestiona su cuenta atrás. El padre lo monta/desmonta (key que
 * cambia por serie) para reiniciarlo y le pasa onDismiss.
 */
export function RestTimer({
  seconds,
  onDismiss,
}: {
  seconds: number;
  onDismiss: () => void;
}) {
  const t = useTranslations('ruedo');
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(200);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, remaining]);

  const minutos = Math.floor(remaining / 60);
  const segundos = remaining % 60;
  const terminado = remaining <= 0;
  const urgente = !terminado && remaining <= 10;

  // El anillo se vacía: offset crece de 0 (lleno) a CIRC (vacío).
  const fraccion = seconds > 0 ? remaining / seconds : 0;
  const dashoffset = CIRC * (1 - fraccion);

  // Color del anillo según estado (vía tokens del tema activo).
  const ringColor = terminado
    ? 'var(--status-success)'
    : urgente
      ? 'var(--accent-2)'
      : 'var(--accent)';

  return (
    <motion.div
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 90, opacity: 0 }}
      className="fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-md items-center gap-4 rounded-3xl border border-border-default bg-bg-elevated/95 px-5 py-4 shadow-2xl backdrop-blur-md"
      style={{ width: 'min(92vw, 26rem)' }}
    >
      {/* Gauge radial */}
      <div className="relative h-[108px] w-[108px] shrink-0">
        <svg width="108" height="108" viewBox="0 0 108 108" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="54" cy="54" r={R} fill="none" stroke="var(--border-default)" strokeWidth="6" />
          <motion.circle
            cx="54"
            cy="54"
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            animate={{ strokeDashoffset: dashoffset }}
            transition={{ ease: 'linear', duration: 1 }}
            style={{ filter: `drop-shadow(0 0 6px ${ringColor})` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`font-mono-metrics text-2xl font-semibold ${urgente ? 'animate-pulse' : ''}`}
            style={{ color: terminado ? 'var(--status-success)' : 'var(--text-primary)' }}
          >
            {terminado ? '0:00' : `${minutos}:${String(segundos).padStart(2, '0')}`}
          </span>
        </div>
      </div>

      {/* Meta + controles */}
      <div className="flex flex-1 flex-col gap-2">
        <span className="font-mono-metrics text-[10px] uppercase tracking-[0.18em] text-text-muted">
          {terminado ? t('restDone') : t('restLabel')}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRemaining((r) => r + 15)}
            className="flex h-10 items-center gap-1 rounded-xl bg-bg-overlay px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            aria-label={t('restAdd15')}
          >
            <Plus size={15} strokeWidth={2} />
            15s
          </button>
          {!terminado && (
            <button
              onClick={() => setRunning((r) => !r)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-overlay text-text-secondary transition-colors hover:text-text-primary"
              aria-label={running ? t('restPause') : t('restResume')}
            >
              {running ? <Pause size={17} strokeWidth={1.5} /> : <Play size={17} strokeWidth={1.5} />}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-on-accent transition-colors hover:bg-accent-hover"
            aria-label={t('restSkip')}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
