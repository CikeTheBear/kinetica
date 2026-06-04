import { useTranslations } from 'next-intl';
import { Trophy } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { PageContainer } from '@/components/page-container';
import { ExerciseRecords } from '@/components/progress/exercise-records';

/**
 * Pantalla de Récords e historial por ejercicio.
 *
 * Las gráficas del Dashboard son AGREGADAS (volumen, frecuencia); aquí se ve la
 * evolución de CADA ejercicio y sus PRs. El componente cliente hace fetch lazy
 * al endpoint /api/progress/records, así que esta página solo monta el shell.
 */
export default async function ProgressPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  await requireUser(locale);
  return <ProgressContent />;
}

function ProgressContent() {
  const t = useTranslations('records');

  return (
    <PageContainer>
      <div className="flex items-center gap-2">
        <Trophy size={20} strokeWidth={1.5} className="text-accent" />
        <h1 className="t-display text-2xl text-text-primary">{t('title')}</h1>
      </div>
      <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>

      <ExerciseRecords />
    </PageContainer>
  );
}
