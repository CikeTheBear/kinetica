import { useTranslations } from 'next-intl';
import { requireOnboarding } from '@/lib/onboarding';
import { requireUser } from '@/lib/auth';

export default async function PlanPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await requireUser(locale);
  await requireOnboarding(user.id, locale);

  return <PlanPageContent />;
}

function PlanPageContent() {
  const t = useTranslations('plan');

  return (
    <div className="flex flex-col items-center justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold text-text-primary">{t('title')}</h1>
      <p className="mt-4 text-center text-text-secondary">{t('emptyState')}</p>
    </div>
  );
}
