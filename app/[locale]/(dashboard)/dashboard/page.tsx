import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/navigation';

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await requireUser(locale);

  // No redirigimos si el onboarding está incompleto: dejamos que el usuario
  // llegue al dashboard y le mostramos una invitación amable a hablar con Kai.
  // (Decisión de UX: preferimos un prompt acogedor a un redirect forzado.)
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single();

  return <DashboardPageContent onboardingCompleted={profile?.onboarding_completed === true} />;
}

function DashboardPageContent({ onboardingCompleted }: { onboardingCompleted: boolean }) {
  const t = useTranslations('dashboard');

  return (
    <div className="flex flex-col px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary">{t('title')}</h1>

      {!onboardingCompleted && (
        <Link
          href="/coach?onboarding=true"
          className="mt-6 flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent-muted p-5 transition-colors hover:bg-accent/10"
        >
          <div className="flex-1">
            <p className="font-semibold text-text-primary">{t('onboardingTitle')}</p>
            <p className="mt-1 text-sm text-text-secondary">{t('onboardingBody')}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent">
              {t('onboardingCta')}
              <ArrowRight size={16} strokeWidth={2} />
            </span>
          </div>
        </Link>
      )}

      {onboardingCompleted && (
        <p className="mt-4 text-text-secondary">{t('emptyState')}</p>
      )}
    </div>
  );
}
