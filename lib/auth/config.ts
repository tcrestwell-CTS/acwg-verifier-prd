import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 hour sessions
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  providers: [
    CredentialsProvider({
      name: "ACWG Admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.adminUser.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.active) return null;

        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Update last login
        await db.adminUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        await writeAuditLog({
          actor: user.email,
          action: "auth:login",
          payload: { userId: user.id, role: user.role },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
};
