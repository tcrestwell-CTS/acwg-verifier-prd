import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuth, getActor } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["reviewer", "admin", "superadmin"]).default("reviewer"),
});

const UpdateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  role: z.enum(["reviewer", "admin", "superadmin"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function GET() {
  const { error } = await requireAuth("superadmin");
  if (error) return error;

  const users = await db.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, email: true, name: true, role: true,
      active: true, lastLoginAt: true, createdAt: true,
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth("superadmin");
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Update existing user
  const updateParsed = UpdateUserSchema.safeParse(body);
  if (updateParsed.success && updateParsed.data.id) {
    const { id, password, ...rest } = updateParsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (password) updateData.passwordHash = await hash(password, 12);

    const user = await db.adminUser.update({ where: { id }, data: updateData });

    await writeAuditLog({
      actor: getActor(session),
      action: "admin:user_updated",
      payload: { userId: id, changes: Object.keys(rest) },
    });

    return NextResponse.json({
      id: user.id, email: user.email, name: user.name, role: user.role, active: user.active,
    });
  }

  // Create new user
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const { password, ...userData } = parsed.data;
  const passwordHash = await hash(password, 12);

  const existing = await db.adminUser.findUnique({ where: { email: userData.email } });
  if (existing) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  const user = await db.adminUser.create({
    data: { ...userData, passwordHash },
  });

  await writeAuditLog({
    actor: getActor(session),
    action: "admin:user_created",
    payload: { userId: user.id, email: user.email, role: user.role },
  });

  return NextResponse.json({
    id: user.id, email: user.email, name: user.name, role: user.role, active: user.active,
  }, { status: 201 });
}
