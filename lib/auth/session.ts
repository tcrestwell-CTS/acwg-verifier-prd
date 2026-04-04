import { getServerSession } from "next-auth";
import { authOptions } from "./config";
import { NextResponse } from "next/server";

export type AdminRole = "reviewer" | "admin" | "superadmin";

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  reviewer: 1,
  admin: 2,
  superadmin: 3,
};

function hasRole(userRole: string, required: AdminRole): boolean {
  return (ROLE_HIERARCHY[userRole as AdminRole] ?? 0) >= ROLE_HIERARCHY[required];
}

/** Get session and enforce minimum role. Returns null + 401 response if unauthorized. */
export async function requireAuth(
  minRole: AdminRole = "reviewer"
): Promise<{ session: Awaited<ReturnType<typeof getServerSession>>; error: null } | { session: null; error: NextResponse }> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized — login required" }, { status: 401 }),
    };
  }

  const role = (session.user as { role?: string }).role ?? "reviewer";
  if (!hasRole(role, minRole)) {
    return {
      session: null,
      error: NextResponse.json(
        { error: `Forbidden — requires ${minRole} role` },
        { status: 403 }
      ),
    };
  }

  return { session, error: null };
}

/** Get actor string for audit logs */
export function getActor(session: Awaited<ReturnType<typeof getServerSession>>): string {
  const s = session as { user?: { email?: string } } | null;
  return s?.user?.email ?? "unknown";
}
