'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Plus } from 'lucide-react';

/** Payload que el formulario envía al endpoint POST /api/biometrics. */
export interface WeighInPayload {
  peso_kg: number;
  porcentaje_grasa?: number;
  porcentaje_musculo?: number;
  porcentaje_agua?: number;
  porcentaje_proteina?: number;
  grasa_visceral?: number;
}

/**
 * Formulario de pesaje rápido. Peso obligatorio arriba; la composición corporal
 * (campos opcionales) va en una sección colapsable para no abrumar al usuario que
 * solo quiere apuntar su peso.
 */
export function WeighInForm({
  onSubmit,
  saving,
}: {
  onSubmit: (payload: WeighInPayload) => Promise<void>;
  saving: boolean;
}) {
  const t = useTranslations('biometrics');

  const [peso, setPeso] = useState('');
  const [grasa, setGrasa] = useState('');
  const [musculo, setMusculo] = useState('');
  const [agua, setAgua] = useState('');
  const [proteina, setProteina] = useState('');
  const [visceral, setVisceral] = useState('');
  const [showComposition, setShowComposition] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsea un campo opcional a number; cadena vacía → undefined (no se envía).
  const parseOpt = (v: string): number | undefined => {
    const trimmed = v.trim();
    if (trimmed === '') return undefined;
    const n = Number(trimmed.replace(',', '.')); // admite coma decimal
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pesoNum = parseOpt(peso);
    if (pesoNum === undefined || pesoNum <= 0) {
      setError(t('errorWeightRequired'));
      return;
    }

    const payload: WeighInPayload = {
      peso_kg: pesoNum,
      porcentaje_grasa: parseOpt(grasa),
      porcentaje_musculo: parseOpt(musculo),
      porcentaje_agua: parseOpt(agua),
      porcentaje_proteina: parseOpt(proteina),
      grasa_visceral: parseOpt(visceral),
    };

    await onSubmit(payload);

    // Limpiar tras un guardado correcto (el padre maneja el error de red).
    setPeso('');
    setGrasa('');
    setMusculo('');
    setAgua('');
    setProteina('');
    setVisceral('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border-default bg-bg-elevated p-4"
    >
      <h3 className="t-display text-base text-text-primary">{t('formTitle')}</h3>
      <p className="mb-4 text-xs text-text-muted">{t('formSubtitle')}</p>

      {/* Peso: obligatorio. */}
      <label className="block">
        <span className="font-mono-metrics text-xs uppercase tracking-[0.15em] text-text-secondary">
          {t('weightLabel')}
        </span>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            placeholder="0.0"
            className="w-32 rounded-lg border border-border-default bg-bg-base px-3 py-2 font-mono-metrics text-lg text-text-primary outline-none focus:border-accent"
            required
          />
          <span className="text-sm text-text-muted">{t('kgUnit')}</span>
        </div>
      </label>

      {/* Composición corporal: opcional, colapsable. */}
      <button
        type="button"
        onClick={() => setShowComposition((v) => !v)}
        className="mt-4 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <span>{t('compositionToggle')}</span>
        <ChevronDown
          size={18}
          strokeWidth={1.5}
          className={showComposition ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>

      {showComposition && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label={t('fatLabel')} unit="%" value={grasa} onChange={setGrasa} />
          <NumberField label={t('muscleLabel')} unit="%" value={musculo} onChange={setMusculo} />
          <NumberField label={t('waterLabel')} unit="%" value={agua} onChange={setAgua} />
          <NumberField label={t('proteinLabel')} unit="%" value={proteina} onChange={setProteina} />
          <NumberField label={t('visceralLabel')} unit="" value={visceral} onChange={setVisceral} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-accent-2">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={16} strokeWidth={2} />
        {saving ? t('saving') : t('saveButton')}
      </button>
    </form>
  );
}

/** Campo numérico opcional reutilizable para la sección de composición. */
function NumberField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono-metrics text-[11px] uppercase tracking-[0.12em] text-text-muted">
        {label}
        {unit && ` (${unit})`}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="mt-1 w-full rounded-lg border border-border-default bg-bg-base px-3 py-2 font-mono-metrics text-sm text-text-primary outline-none focus:border-accent"
      />
    </label>
  );
}
