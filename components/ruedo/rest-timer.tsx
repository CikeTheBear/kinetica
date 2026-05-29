'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pause, Play, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Timer de descanso flotante. Se monta cuando el usuario completa una serie y
 * cuenta atrás desde los segundos de descanso del ejercicio.
 *
 * Es self-contained: gestiona su propia cuenta atrás. El padre lo monta/desmonta
 * (con una key que cambia en cada serie completada) para reiniciarlo, y le pasa
 * onDismiss para cerrarlo manualmente o al terminar.
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
          // Pequeña vibración al terminar (si el dispositivo lo soporta).
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(200);
          }
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

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-border-default bg-bg-elevated px-4 py-3 shadow-lg"
    >
      <div className="flex flex-col">
        <span className="text-xs text-text-muted">{t('restLabel')}</span>
        <span
          className={`font-mono-metrics text-2xl font-semibold ${
            terminado ? 'text-status-success' : 'text-accent'
          }`}
        >
          {terminado
            ? t('restDone')
            : `${minutos}:${String(segundos).padStart(2, '0')}`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* +15s */}
        <button
          onClick={() => setRemaining((r) => r + 15)}
          className="flex h-10 items-center gap-1 rounded-lg bg-bg-overlay px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          aria-label={t('restAdd15')}
        >
          <Plus size={16} strokeWidth={1.5} />
          15s
        </button>

        {/* Pausar / reanudar (oculto si ya terminó) */}
        {!terminado && (
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-overlay text-text-secondary transition-colors hover:text-text-primary"
            aria-label={running ? t('restPause') : t('restResume')}
          >
            {running ? (
              <Pause size={18} strokeWidth={1.5} />
            ) : (
              <Play size={18} strokeWidth={1.5} />
            )}
          </button>
        )}

        {/* Saltar / cerrar */}
        <button
          onClick={onDismiss}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-on-accent transition-colors hover:bg-accent-hover"
          aria-label={t('restSkip')}
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
    </motion.div>
  );
}
