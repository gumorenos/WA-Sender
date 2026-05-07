"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

type GoogleLoginButtonProps = {
  callbackUrl?: string;
};

export function GoogleLoginButton({ callbackUrl = "/dashboard" }: GoogleLoginButtonProps) {
  return (
    <Button
      className="w-full justify-center py-3"
      onClick={() => void signIn("google", { callbackUrl })}
    >
      Continuar con Google
    </Button>
  );
}
