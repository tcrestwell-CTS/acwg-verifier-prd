"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { formatDate } from "@/lib/format";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "reviewer" | "admin" | "superadmin";
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700 border-purple-200",
  admin:      "bg-blue-100 text-blue-700 border-blue-200",
  reviewer:   "bg-slate-100 text-slate-600 border-slate-200",
};

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin:      "Admin",
  reviewer:   "Sales Rep",
};

export default function UsersPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "reviewer" as AdminUser["role"],
  });

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Forbidden");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = editUser
        ? { id: editUser.id, name: form.name, role: form.role, ...(form.password ? { password: form.password } : {}) }
        : { name: form.name, email: form.email, password: form.password, role: form.role };

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      success(editUser ? "User updated" : "User created", editUser ? `${form.name} has been updated` : `${form.name} can now sign in`);
      setShowForm(false);
      setEditUser(null);
      setForm({ name: "", email: "", password: "", role: "reviewer" });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => toastError("Failed", err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (user: AdminUser) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, active: !user.active }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (_, user) => {
      success(user.active ? "User deactivated" : "User activated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => toastError("Failed", err.message),
  });

  const openEdit = (user: AdminUser) => {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    setShowForm(true);
  };

  const openNew = () => {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", role: "reviewer" });
    setShowForm(true);
  };

  if (isLoading) return <LoadingPage label="Loading users…" />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 mt-1">Add and manage sales reps and admin users.</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          + Add User
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="card p-6 border-2 border-blue-100">
          <h2 className="font-semibold text-slate-900 mb-5">
            {editUser ? `Edit ${editUser.name}` : "Add New User"}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                placeholder="Sarah Johnson"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Role *</label>
              <select
                className="form-input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as AdminUser["role"] })}
              >
                <option value="reviewer">Sales Rep</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>
            {!editUser && (
              <div>
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="sarah@acwg.net"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="form-label">
                {editUser ? "New Password (leave blank to keep current)" : "Password *"}
              </label>
              <input
                type="password"
                className="form-input"
                placeholder={editUser ? "Leave blank to keep" : "Min 8 characters"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          {/* Role description */}
          <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
            {form.role === "reviewer" && "Sales Rep — can create new orders, run verifications, and make decisions. Cannot access admin pages."}
            {form.role === "admin" && "Admin — full access including rules editor, reports, chargebacks, and jobs."}
            {form.role === "superadmin" && "Super Admin — full access including user management, retention jobs, and experiments."}
          </div>

          <div className="flex gap-3 mt-5 justify-end">
            <button onClick={() => { setShowForm(false); setEditUser(null); }} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name || (!editUser && (!form.email || !form.password))}
              className="btn-primary"
            >
              {saveMutation.isPending ? "Saving…" : editUser ? "Save Changes" : "Create User"}
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-hidden">
        {!users?.length ? (
          <div className="text-center py-12 text-slate-400">No users yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {["Name", "Email", "Role", "Status", "Last Login", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className={`hover:bg-slate-50 ${!user.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{user.name}</td>
                  <td className="px-4 py-3 text-slate-500">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge border ${ROLE_COLORS[user.role]}`}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${user.active ? "badge-pass" : "badge-neutral"}`}>
                      {user.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(user)}
                        className="btn-secondary text-xs px-2 py-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive.mutate(user)}
                        className={`text-xs px-2 py-1 btn ${user.active ? "btn-danger" : "btn-success"}`}
                      >
                        {user.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
