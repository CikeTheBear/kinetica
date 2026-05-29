import { describe, expect, it } from 'vitest';
import { computeProgress, getWeekStart, type WorkoutLogRow } from '@/lib/progress';

// Helper: formatea un Date a YYYY-MM-DD en componentes locales (como hace lib/progress).
function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: fecha de hace `dias` días respecto a hoy.
function hace(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return ymd(d);
}

describe('getWeekStart', () => {
  // 2024-01-01 fue lunes; lo usamos como ancla conocida.
  it('devuelve el lunes de la semana', () => {
    expect(getWeekStart('2024-01-03')).toBe('2024-01-01'); // miércoles → lunes
    expect(getWeekStart('2024-01-07')).toBe('2024-01-01'); // domingo → lunes de esa semana
    expect(getWeekStart('2024-01-08')).toBe('2024-01-08'); // lunes → él mismo
  });

  it('es idempotente', () => {
    const x = getWeekStart('2026-05-29');
    expect(getWeekStart(x)).toBe(x);
  });
});

describe('computeProgress', () => {
  it('sin entrenos devuelve resumen en cero y 8 semanas vacías', () => {
    const data = computeProgress([]);
    expect(data.summary.totalEntrenos).toBe(0);
    expect(data.summary.volumenTotalKg).toBe(0);
    expect(data.summary.rachaSemanas).toBe(0);
    expect(data.volumenPorSesion).toHaveLength(0);
    expect(data.frecuenciaSemanal).toHaveLength(8);
    expect(data.frecuenciaSemanal.every((s) => s.entrenos === 0)).toBe(true);
  });

  it('suma volumen solo de series completadas', () => {
    const rows: WorkoutLogRow[] = [
      {
        fecha: '2026-05-25',
        ejercicio_nombre: 'Press banca',
        sets: [
          { serie: 1, peso_kg: 50, reps: 10, completado: true }, // 500
          { serie: 2, peso_kg: 50, reps: 8, completado: true }, //  400
          { serie: 3, peso_kg: 50, reps: 8, completado: false }, //   0 (no cuenta)
        ],
      },
    ];
    const data = computeProgress(rows);
    expect(data.summary.volumenTotalKg).toBe(900);
    expect(data.summary.totalEntrenos).toBe(1);
    expect(data.volumenPorSesion).toEqual([{ fecha: '2026-05-25', volumenKg: 900 }]);
  });

  it('cuenta días distintos como entrenos y agrupa volumen por fecha', () => {
    const rows: WorkoutLogRow[] = [
      {
        fecha: '2026-05-25',
        ejercicio_nombre: 'Sentadilla',
        sets: [{ serie: 1, peso_kg: 100, reps: 5, completado: true }], // 500
      },
      {
        fecha: '2026-05-25',
        ejercicio_nombre: 'Peso muerto',
        sets: [{ serie: 1, peso_kg: 120, reps: 5, completado: true }], // 600
      },
      {
        fecha: '2026-05-27',
        ejercicio_nombre: 'Press militar',
        sets: [{ serie: 1, peso_kg: 40, reps: 10, completado: true }], // 400
      },
    ];
    const data = computeProgress(rows);
    expect(data.summary.totalEntrenos).toBe(2); // dos fechas distintas
    expect(data.summary.volumenTotalKg).toBe(1500);
    // El volumen del 25 agrupa ambos ejercicios (500 + 600).
    expect(data.volumenPorSesion).toEqual([
      { fecha: '2026-05-25', volumenKg: 1100 },
      { fecha: '2026-05-27', volumenKg: 400 },
    ]);
  });

  it('calcula la racha de semanas consecutivas hasta la semana actual', () => {
    // Entrenos esta semana, la pasada y hace dos semanas → racha de 3.
    const rows: WorkoutLogRow[] = [hace(0), hace(7), hace(14)].map((fecha) => ({
      fecha,
      ejercicio_nombre: 'Test',
      sets: [{ serie: 1, peso_kg: 10, reps: 10, completado: true }],
    }));
    const data = computeProgress(rows);
    expect(data.summary.rachaSemanas).toBe(3);
  });

  it('limita la gráfica de volumen a las últimas N sesiones', () => {
    // 12 sesiones en fechas distintas; pedimos máximo 10.
    const rows: WorkoutLogRow[] = Array.from({ length: 12 }, (_, i) => ({
      fecha: `2026-03-${String(i + 1).padStart(2, '0')}`,
      ejercicio_nombre: 'Test',
      sets: [{ serie: 1, peso_kg: 10, reps: 10, completado: true }],
    }));
    const data = computeProgress(rows, 10);
    expect(data.volumenPorSesion).toHaveLength(10);
    // Se quedan las MÁS recientes: del 3 al 12 de marzo.
    expect(data.volumenPorSesion[0].fecha).toBe('2026-03-03');
    expect(data.volumenPorSesion[9].fecha).toBe('2026-03-12');
  });
});
