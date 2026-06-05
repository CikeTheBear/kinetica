import { describe, it, expect } from 'vitest';
import { addWeeks, isDeloadWeek } from '@/lib/mesocycle';

/**
 * La aritmética de fechas del mesociclo (a qué lunes cae cada semana del bloque)
 * y la regla de deload son lógica pura fácil de romper en silencio (cruces de
 * mes/año, off-by-one). Las blindamos.
 */

describe('addWeeks', () => {
  it('suma semanas dentro del mismo mes', () => {
    expect(addWeeks('2026-06-01', 1)).toBe('2026-06-08');
    expect(addWeeks('2026-06-01', 3)).toBe('2026-06-22');
  });

  it('cruza el cambio de mes', () => {
    expect(addWeeks('2026-06-29', 1)).toBe('2026-07-06');
  });

  it('cruza el cambio de año', () => {
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04');
  });

  it('0 semanas devuelve la misma fecha', () => {
    expect(addWeeks('2026-06-01', 0)).toBe('2026-06-01');
  });
});

describe('isDeloadWeek', () => {
  it('la última semana de un bloque de ≥2 es descarga', () => {
    expect(isDeloadWeek(4, 4)).toBe(true);
    expect(isDeloadWeek(6, 6)).toBe(true);
  });

  it('las semanas intermedias no son descarga', () => {
    expect(isDeloadWeek(1, 4)).toBe(false);
    expect(isDeloadWeek(3, 4)).toBe(false);
  });

  it('un bloque de 1 semana no tiene descarga', () => {
    expect(isDeloadWeek(1, 1)).toBe(false);
  });
});
