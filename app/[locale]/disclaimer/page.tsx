import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { DisclaimerContent } from './disclaimer-content';

/**
 * Esta página vive fuera del grupo (dashboard), así que NO hereda su guard de
 * auth. Sin sesión, acceptDisclaimer() reventaría ("Usuario no autenticado").
 * Añadimos aquí un guard server-side replicando el patrón de las páginas del
 * dashboard: si no hay user, redirige a /login en el locale activo.
 */
export default async function DisclaimerPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await getUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  return <DisclaimerContent />;
}
