import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";
import { SignInGate } from "@/lib/auth/gates";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f2e4c4] p-6 text-[#3a1a10]">
      <div className="w-full max-w-sm rounded-3xl bg-[#f6e7c1] p-6 shadow-xl">
        <h1 className="qayd-display mb-4 text-3xl text-[#7a1f1f]">قيد ما يقيد إلا القافط</h1>
        <SignInGate fallback={<AuthPanel onDone={() => void navigate({ to: "/" })} />}>
          <p className="mb-4 text-sm">أنت داخل. الطاولة جاهزة.</p>
          <a href="/" className="inline-flex min-h-12 items-center rounded-xl bg-[#7a1f1f] px-4 text-[#f6e7c1]">
            رجوع للديوانية
          </a>
        </SignInGate>
      </div>
    </main>
  );
}
