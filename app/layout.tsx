"use client";

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ToastProvider } from "@/components/ui/Toast";

const navItems = [
  { href: "/orders/new",     label: "New Order" },
  { href: "/orders/queue",   label: "Review Queue" },
];

const adminItems = [
  { href: "/admin/rules",        label: "Rules" },
  { href: "/admin/reports",      label: "Reports" },
  { href: "/admin/chargebacks",  label: "Chargebacks" },
  { href: "/admin/jobs",         label: "Jobs" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  const pathname = usePathname();

  return (
    <html lang="en">
      <head>
        <title>ACWG Verifier — American Carpet Wholesalers</title>
        <meta name="description" content="Sales Rep Fraud Verification Portal — American Carpet Wholesalers of Georgia" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            {/* Header */}
            <header className="sticky top-0 z-40 shadow-md" style={{ background: "linear-gradient(135deg, #8b1a1a 0%, #6b1414 45%, #1a2f5e 100%)" }}>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                  {/* Logo */}
                  <Link href="/" className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-10 h-10 flex items-center justify-center">
                      <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="20" cy="20" r="20" fill="white" fillOpacity="0.15" />
                        <polygon points="20,6 23.5,16 34,16 25.5,22 28.5,33 20,27 11.5,33 14.5,22 6,16 16.5,16" fill="white" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-extrabold text-sm leading-tight tracking-widest drop-shadow">AMERICAN CARPET WHOLESALERS</p>
                      <p className="text-white/90 text-xs font-semibold tracking-widest">FRAUD VERIFICATION PORTAL</p>
                    </div>
                  </Link>

                  {/* Main nav */}
                  <nav className="flex items-center gap-1">
                    {navItems.map((item) => (
                      <Link key={item.href} href={item.href} className={clsx(
                        "px-3 py-2 rounded-md text-sm font-semibold transition-all",
                        pathname.startsWith(item.href)
                          ? "bg-white text-red-700 shadow"
                          : "text-white font-medium hover:bg-white/20"
                      )}>
                        {item.label}
                      </Link>
                    ))}
                    <span className="text-white/30 mx-1">|</span>
                    {adminItems.map((item) => (
                      <Link key={item.href} href={item.href} className={clsx(
                        "px-3 py-2 rounded-md text-xs font-semibold transition-all",
                        pathname.startsWith(item.href)
                          ? "bg-white/90 text-navy-700 shadow"
                          : "text-white/90 hover:bg-white/20 hover:text-white"
                      )}>
                        {item.label}
                      </Link>
                    ))}
                  </nav>

                  {/* Live badge */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-300 font-semibold">Live</span>
                  </div>
                </div>
              </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </main>
          </ToastProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </body>
    </html>
  );
}
