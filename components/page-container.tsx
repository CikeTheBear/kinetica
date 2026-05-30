import { cn } from '@/lib/utils';

/**
 * Contenedor estándar de página: ancho máximo cómodo y padding responsive.
 * Centraliza el "no estirar de extremo a extremo" en desktop. El chat (Coach)
 * gestiona su propio layout de altura completa y no usa este contenedor.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10', className)}>
      {children}
    </div>
  );
}
