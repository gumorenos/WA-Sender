import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";

import { canSignInToBeta } from "@/lib/auth/beta-access";
import { ensureDefaultWorkspace } from "@/lib/auth/workspace";
import { prisma } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return canSignInToBeta(user.email);
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.status = user.status;
      }

      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await prisma.profile.upsert({
          where: { userId: user.id },
          update: {
            fullName: user.name,
            avatarUrl: user.image,
          },
          create: {
            userId: user.id,
            fullName: user.name,
            avatarUrl: user.image,
          },
        });
        await ensureDefaultWorkspace(user.id);
      }
    },
    async signIn({ user }) {
      if (user.id) {
        await prisma.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "LOGIN",
            resourceType: "auth_session",
          },
        });
      }
    },
  },
};
