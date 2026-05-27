'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/navigation';
import { signIn } from '@/app/actions/auth';

export function LoginForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);

    const result = await signIn(formData);

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    if (result?.success && result?.redirectTo) {
      // Navegación full-page para evitar cualquier loop del router
      window.location.href = result.redirectTo;
      return;
    }

    setIsLoading(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      {/* Locale activo: la action lo lee para construir el redirect en el idioma correcto */}
      <input type="hidden" name="locale" value={locale} />
      {error && (
        <div className="rounded-lg bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-text-secondary">
          {t('email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-border-default bg-bg-overlay px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="tu@email.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-text-secondary">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          minLength={6}
          className="rounded-lg border border-border-default bg-bg-overlay px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mt-2 rounded-lg bg-accent py-3 text-sm font-semibold text-[#0A0E14] transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {isLoading ? '...' : t('loginButton')}
      </button>

      <p className="text-center text-sm text-text-secondary">
        {t('noAccount')}{' '}
        <Link href="/register" className="text-accent hover:text-accent-hover">
          {t('register')}
        </Link>
      </p>
    </form>
  );
}
