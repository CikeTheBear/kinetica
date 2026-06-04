import { requireUser } from '@/lib/auth';
import { getBiometricsHistory } from '@/lib/biometrics-server';
import { BiometricsView } from '@/components/biometrics/biometrics-view';

/**
 * Página de registro biométrico manual ("Cuerpo"). Trae el historial inicial en
 * el server (RLS limita a lo propio) y delega la interacción al BiometricsView.
 */
export default async function BiometricsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await requireUser(locale);
  const entries = await getBiometricsHistory(user.id);

  return <BiometricsView initialEntries={entries} />;
}
