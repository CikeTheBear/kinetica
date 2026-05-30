import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { useTranslations } from 'next-intl';
import { LoginForm } from '@/components/auth/login-form';

export default async function LoginPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  // Si ya está autenticado, redirige al dashboard
  const user = await getUser();
  if (user) {
    redirect(`/${locale}/dashboard`);
  }

  // Usamos un wrapper client para el t
  return <LoginPageContent />;
}

function LoginPageContent() {
  const t = useTranslations('auth');

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <span className="t-display text-3xl tracking-tight text-text-primary">
          KINÉ<span className="text-accent">TICA</span>
        </span>
        <p className="mt-2 text-sm text-text-secondary">{t('loginSubtitle')}</p>
      </div>
      <LoginForm />
    </div>
  );
}
