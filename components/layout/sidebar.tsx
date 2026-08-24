"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    title: "Core",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/instances", label: "Instancias" },
    ],
  },
  {
    title: "Campanas",
    items: [
      { href: "/campaigns/create", label: "Crear campana" },
      { href: "/campaigns/status", label: "Estado" },
      { href: "/campaigns/send", label: "Enviar" },
    ],
  },
  {
    title: "Agentes",
    items: [
      { href: "/agents/create", label: "Crear agente" },
      { href: "/agents", label: "Listado" },
      { href: "/conversations", label: "Conversaciones" },
      { href: "/agents/playground", label: "Playground" },
    ],
  },
  {
    title: "Operaciones",
    items: [
      { href: "/webhooks/recovery", label: "Recovery webhooks" },
    ],
  },
  {
    title: "Utilities",
    items: [
      { href: "/utilities/extract-numbers", label: "Extraer numeros" },
      { href: "/utilities/message-preview", label: "Preview mensaje" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass-panel hidden w-80 shrink-0 flex-col rounded-none border-r border-l-0 border-t-0 border-b-0 px-6 py-8 lg:flex">
      <div className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-sm font-bold text-slate-950">
            WA
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent">
              Beta workspace
            </p>
            <h1 className="text-xl font-semibold text-foreground">WA Sender</h1>
          </div>
        </div>
        <p className="text-sm leading-6 text-foreground-muted">
          Base visual del operador de WhatsApp, campanas y agentes IA.
        </p>
      </div>

      <nav className="mt-8 flex-1 space-y-8">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground-muted">
              {group.title}
            </p>
            <div className="space-y-1.5">
              {group.items.map((item) => {
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition",
                      active
                        ? "bg-accent text-slate-950 shadow-[0_14px_40px_rgba(45,212,191,0.22)]"
                        : "text-foreground-muted hover:bg-white/5 hover:text-foreground",
                    )}
                  >
                    <span>{item.label}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                      {active ? "Live" : "Go"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="rounded-3xl border border-border bg-background-panel p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
          Plan demo
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          1 instancia, limites conservadores y modo mock listo para desarrollo.
        </p>
        <SignOutButton className="mt-4 w-full border border-border" />
      </div>
    </aside>
  );
}
