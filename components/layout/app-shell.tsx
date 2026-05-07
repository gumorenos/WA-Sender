"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";

const mobileLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/instances", label: "Instancias" },
  { href: "/campaigns/create", label: "Campanas" },
  { href: "/agents", label: "Agentes" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="page-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px]">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-border bg-background px-4 py-4 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  WA Sender
                </p>
                <p className="text-sm text-foreground-muted">Visual base en modo mock</p>
              </div>
              <SignOutButton className="border border-border px-4 py-2 text-sm" />
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {mobileLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm transition",
                    pathname === link.href
                      ? "bg-accent text-slate-950"
                      : "border border-border text-foreground-muted",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </header>
          <main className="flex-1 px-4 py-6 md:px-6 lg:px-10 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
