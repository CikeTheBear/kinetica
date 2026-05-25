import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/bottom-nav';
import { UserMenu } from '@/components/auth/user-menu';

export default async function DashboardLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const user = await requireUser(locale);

  // Verificar onboarding (disclaimer se maneja por página individualmente)
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect(`/${locale}/coach?onboarding=true`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-base/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <span className="text-lg font-bold tracking-tight text-accent">
            Kinética
          </span>
          <UserMenu user={user} />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
