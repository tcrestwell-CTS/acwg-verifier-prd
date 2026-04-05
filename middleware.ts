import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Admin-only pages
    const adminOnlyPaths = [
      "/admin/rules", "/admin/reports", "/admin/chargebacks",
      "/admin/jobs", "/admin/settings",
      "/api/admin/rules", "/api/admin/reports", "/api/admin/chargebacks",
      "/api/admin/jobs", "/api/admin/retention", "/api/admin/experiments",
      "/api/admin/settings",
      "/admin/users",
      "/api/admin/users",
    ];

    const superAdminOnlyPaths = [
      "/admin/users", "/api/admin/users",
      "/admin/settings", "/api/admin/settings",
      "/api/admin/retention", "/api/admin/experiments",
    ];

    const requiresSuperAdmin = superAdminOnlyPaths.some((p) => pathname.startsWith(p));

    if (requiresSuperAdmin) {
      const role = (token as { role?: string } | null)?.role ?? "reviewer";
      if (role !== "superadmin") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden — superadmin role required" }, { status: 403 });
        }
        const url = req.nextUrl.clone();
        url.pathname = "/admin/login";
        url.searchParams.set("error", "AccessDenied");
        return NextResponse.redirect(url);
      }
    }

    const requiresAdmin = adminOnlyPaths.some((p) => pathname.startsWith(p));

    if (requiresAdmin) {
      const role = (token as { role?: string } | null)?.role ?? "reviewer";
      if (role !== "admin" && role !== "superadmin") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
        }
        const url = req.nextUrl.clone();
        url.pathname = "/admin/login";
        url.searchParams.set("error", "AccessDenied");
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Public pages — no auth needed
        if (pathname === "/login") return true;
        if (pathname === "/admin/login") return true;
        if (pathname === "/") return true;

        // Orders require any valid session
        if (pathname.startsWith("/orders/") || pathname.startsWith("/api/")) {
          return !!token;
        }

        // Admin area requires valid session
        if (pathname.startsWith("/admin/")) return !!token;

        return true;
      },
    },
    pages: {
      signIn: "/login",   // rep login
    },
  }
);

export const config = {
  matcher: [
    "/orders/:path*",
    "/admin/:path*",
    "/api/verify",
    "/api/decision/:path*",
    "/api/orders/:path*",
    "/api/escalation/:path*",
    "/api/admin/:path*",
  ],
};
