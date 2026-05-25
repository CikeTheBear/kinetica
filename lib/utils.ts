import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases de Tailwind con merge inteligente.
 * Útil para componentes con variantes (shadcn/ui style).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
