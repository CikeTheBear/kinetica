import { describe, expect, it } from 'vitest';
import {
  computeIMC,
  summarizeWeightTrend,
  type BiometricEntry,
} from '@/lib/biometrics';

describe('computeIMC', () => {
  it('calcula el IMC con peso y altura válidos', () => {
    // 70 kg, 175 cm → 70 / 1.75² = 22.857... → 22.86 redondeado.
    expect(computeIMC(70, 175)).toBe(22.86);
    // 80 kg, 180 cm → 80 / 1.8² = 24.69...
    expect(computeIMC(80, 180)).toBe(24.69);
  });

  it('redondea a 2 decimales', () => {
    const imc = computeIMC(70, 175);
    expect(imc).not.toBeNull();
    // No más de 2 decimales.
    expect(Number.isInteger((imc as number) * 100)).toBe(true);
  });

  it('devuelve null ante inputs nulos o undefined', () => {
    expect(computeIMC(null, 175)).toBeNull();
    expect(computeIMC(70, null)).toBeNull();
    expect(computeIMC(undefined, undefined)).toBeNull();
  });

  it('devuelve null ante peso o altura <= 0', () => {
    expect(computeIMC(0, 175)).toBeNull();
    expect(computeIMC(70, 0)).toBeNull();
    expect(computeIMC(-70, 175)).toBeNull();
    expect(computeIMC(70, -175)).toBeNull();
  });

  it('devuelve null ante valores no finitos', () => {
    expect(computeIMC(NaN, 175)).toBeNull();
    expect(computeIMC(70, Infinity)).toBeNull();
    expect(computeIMC(Infinity, 175)).toBeNull();
  });
});

describe('summarizeWeightTrend', () => {
  const mk = (fecha: string, peso_kg: number | null): BiometricEntry => ({
    fecha,
    peso_kg,
  });

  it('vacío devuelve null y serie vacía', () => {
    const r = summarizeWeightTrend([]);
    expect(r.pesoActualKg).toBeNull();
    expect(r.deltaKg).toBeNull();
    expect(r.serie).toEqual([]);
  });

  it('ordena por fecha ascendente independientemente del orden de entrada', () => {
    const entries = [mk('2026-03-10', 82), mk('2026-03-01', 80), mk('2026-03-05', 81)];
    const r = summarizeWeightTrend(entries);
    expect(r.serie.map((p) => p.fecha)).toEqual([
      '2026-03-01',
      '2026-03-05',
      '2026-03-10',
    ]);
  });

  it('el peso actual es el del último pesaje (más reciente)', () => {
    const entries = [mk('2026-03-01', 80), mk('2026-03-10', 82.5)];
    const r = summarizeWeightTrend(entries);
    expect(r.pesoActualKg).toBe(82.5);
  });

  it('el delta es la diferencia vs el pesaje anterior, redondeado a 1 decimal', () => {
    const entries = [mk('2026-03-01', 80), mk('2026-03-10', 81.25)];
    const r = summarizeWeightTrend(entries);
    expect(r.deltaKg).toBe(1.3); // 81.25 - 80 = 1.25 → 1.3 (redondeo a 1 decimal)
  });

  it('el delta es negativo cuando se baja de peso', () => {
    const entries = [mk('2026-03-01', 82), mk('2026-03-10', 80)];
    const r = summarizeWeightTrend(entries);
    expect(r.deltaKg).toBe(-2);
  });

  it('con un solo pesaje el delta es null', () => {
    const r = summarizeWeightTrend([mk('2026-03-01', 80)]);
    expect(r.pesoActualKg).toBe(80);
    expect(r.deltaKg).toBeNull();
  });

  it('ignora pesajes sin peso o con peso inválido', () => {
    const entries = [
      mk('2026-03-01', 80),
      mk('2026-03-05', null),
      mk('2026-03-08', 0),
      mk('2026-03-10', 81),
    ];
    const r = summarizeWeightTrend(entries);
    expect(r.serie.map((p) => p.pesoKg)).toEqual([80, 81]);
    expect(r.pesoActualKg).toBe(81);
    expect(r.deltaKg).toBe(1);
  });
});
