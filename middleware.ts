import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Admin-only pages (rules, reports, chargebacks, jobs, experiments)
    const adminOnlyPaths = [
      "/admin/rules",
      "/admin/reports",
      "/admin/chargebacks",
      "/admin/jobs",
      "/api/admin/rules",
      "/api/admin/reports",
      "/api/admin/chargebacks",
      "/api/admin/jobs",
      "/api/admin/retention",
      "/api/admin/experiments",
    ];

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
        // Allow login page without token
        if (req.nextUrl.pathname === "/admin/login") return true;
        // All other /admin/* and /api/admin/* require a valid token
        if (
          req.nextUrl.pathname.startsWith("/admin/") ||
          req.nextUrl.pathname.startsWith("/api/admin/")
        ) {
          return !!token;
        }
        return true;
      },
    },
    pages: { signIn: "/admin/login" },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
