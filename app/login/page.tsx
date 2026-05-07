import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { GoogleLoginButton } from "@/components/auth/google-login-button";
import { authOptions } from "@/lib/auth/config";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const callbackUrl = params?.callbackUrl ?? "/dashboard";

  return (
    <div className="page-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-between gap-8 rounded-[32px] border border-border bg-background-panel p-8">
          <div className="space-y-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent">
              WA Sender Beta
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Controla instancias, campanas y agentes desde un solo panel.
            </h1>
            <p className="max-w-xl text-sm leading-7 text-foreground-muted md:text-base">
              Esta base visual usa datos mock mientras auth, base de datos y servicios
              reales quedan pendientes. El objetivo es fijar la experiencia del operador.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              "Sidebar de operador oscuro y responsive.",
              "Campanas con preview y estados separados.",
              "Playground IA preparado para providers mock.",
            ].map((item) => (
              <Card key={item} className="rounded-3xl bg-background-soft p-4">
                <p className="text-sm leading-6 text-foreground-muted">{item}</p>
              </Card>
            ))}
          </div>
        </div>

        <Card className="mx-auto flex w-full max-w-xl flex-col justify-between gap-8 p-8">
          <div className="space-y-4">
            <div className="inline-flex rounded-full border border-accent/30 bg-accent-soft px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Auth pendiente
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight">Acceso con Google</h2>
              <p className="text-sm leading-6 text-foreground-muted">
                Esta pantalla reserva el flujo para Auth.js con Google OAuth. Por ahora es
                una entrada visual sin backend conectado.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <GoogleLoginButton callbackUrl={callbackUrl} />
            <p className="text-xs leading-6 text-foreground-muted">
              Auth.js resuelve la sesion en el servidor y crea el workspace demo al
              primer acceso.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-foreground-muted transition hover:text-foreground"
          >
            Ir al dashboard mock
          </Link>
        </Card>
      </div>
    </div>
  );
}
