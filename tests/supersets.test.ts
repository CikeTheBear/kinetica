import { describe, it, expect } from 'vitest';
import { groupBySuperset } from '@/lib/workout';

/**
 * groupBySuperset agrupa ejercicios CONSECUTIVOS que comparten `grupo`
 * (superserie). Es lo que usan la vista del Plan y el Ruedo para enmarcar las
 * superseries, así que blindamos los casos límite (no consecutivos, vacío,
 * grupo vacío) para que el render no se descuadre.
 */

// Forma mínima de un ejercicio para el test: id para identificarlo + grupo
// opcional. Anotarlo explícitamente evita el "weak type check" de TS al pasar
// objetos sin `grupo` a un genérico cuyo constraint es { grupo?: string }.
type Ej = { id: number; grupo?: string };

// Helper para describir el resultado de forma compacta en los asserts.
function shape(groups: { grupo?: string; ejercicios: Ej[] }[]) {
  return groups.map((g) => ({ grupo: g.grupo, ids: g.ejercicios.map((e) => e.id) }));
}

describe('groupBySuperset', () => {
  it('lista vacía → sin grupos', () => {
    expect(groupBySuperset<Ej>([])).toEqual([]);
  });

  it('ejercicios sin grupo → cada uno en su propio grupo individual', () => {
    const ejs: Ej[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(shape(groupBySuperset(ejs))).toEqual([
      { grupo: undefined, ids: [1] },
      { grupo: undefined, ids: [2] },
      { grupo: undefined, ids: [3] },
    ]);
  });

  it('dos consecutivos con el mismo grupo → una superserie', () => {
    const ejs: Ej[] = [
      { id: 1, grupo: 'A' },
      { id: 2, grupo: 'A' },
    ];
    expect(shape(groupBySuperset(ejs))).toEqual([{ grupo: 'A', ids: [1, 2] }]);
  });

  it('mezcla de solos y superseries respeta el orden', () => {
    const ejs: Ej[] = [
      { id: 1 },
      { id: 2, grupo: 'A' },
      { id: 3, grupo: 'A' },
      { id: 4 },
      { id: 5, grupo: 'B' },
      { id: 6, grupo: 'B' },
    ];
    expect(shape(groupBySuperset(ejs))).toEqual([
      { grupo: undefined, ids: [1] },
      { grupo: 'A', ids: [2, 3] },
      { grupo: undefined, ids: [4] },
      { grupo: 'B', ids: [5, 6] },
    ]);
  });

  it('mismo grupo pero NO consecutivos → grupos separados (no reordena)', () => {
    const ejs: Ej[] = [
      { id: 1, grupo: 'A' },
      { id: 2 },
      { id: 3, grupo: 'A' },
    ];
    expect(shape(groupBySuperset(ejs))).toEqual([
      { grupo: 'A', ids: [1] },
      { grupo: undefined, ids: [2] },
      { grupo: 'A', ids: [3] },
    ]);
  });

  it('grupo vacío ("") se trata como ejercicio solo', () => {
    const ejs: Ej[] = [
      { id: 1, grupo: '' },
      { id: 2, grupo: '' },
    ];
    expect(shape(groupBySuperset(ejs))).toEqual([
      { grupo: undefined, ids: [1] },
      { grupo: undefined, ids: [2] },
    ]);
  });

  it('tres consecutivos con el mismo grupo → una superserie de tres', () => {
    const ejs: Ej[] = [
      { id: 1, grupo: 'A' },
      { id: 2, grupo: 'A' },
      { id: 3, grupo: 'A' },
    ];
    expect(shape(groupBySuperset(ejs))).toEqual([{ grupo: 'A', ids: [1, 2, 3] }]);
  });
});
