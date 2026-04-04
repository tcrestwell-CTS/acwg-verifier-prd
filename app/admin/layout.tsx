"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";
import type { ReactNode } from "react";

const adminNavItems = [
  { href: "/admin/reports",      label: "Reports",      role: "admin" },
  { href: "/admin/rules",        label: "Rules",        role: "admin" },
  { href: "/admin/chargebacks",  label: "Chargebacks",  role: "admin" },
  { href: "/admin/jobs",         label: "Jobs",         role: "admin" },
];

function AdminNav() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (pathname === "/admin/login") return null;

  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const name = session?.user?.name ?? session?.user?.email ?? "";

  const roleBadgeColor: Record<string, string> = {
    superadmin: "bg-purple-100 text-purple-700",
    admin: "bg-blue-100 text-blue-700",
    reviewer: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-10">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest">
              Admin
            </span>
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "text-xs font-medium transition-colors px-2 py-1 rounded",
                  pathname.startsWith(item.href)
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {role && (
              <span className={clsx("text-xs px-2 py-0.5 rounded font-medium", roleBadgeColor[role] ?? "bg-slate-100 text-slate-600")}>
                {role}
              </span>
            )}
            <span className="text-xs text-slate-400">{name}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/admin/login" })}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AdminNav />
      <div>{children}</div>
    </SessionProvider>
  );
}
