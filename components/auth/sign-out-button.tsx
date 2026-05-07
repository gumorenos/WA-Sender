"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <Button
      className={className}
      variant="ghost"
      onClick={() => void signOut({ callbackUrl: "/login" })}
    >
      Salir
    </Button>
  );
}
