export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border-default bg-bg-elevated/60 p-6 backdrop-blur-sm">
        {children}
      </div>
    </div>
  );
}
