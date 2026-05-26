import { redirect } from 'next/navigation';

export default function RootPage({ params: { locale } }: { params: { locale: string } }) {
  // Temporal: ir directo a coach para evitar redirect chains
  redirect(`/${locale}/coach`);
}
