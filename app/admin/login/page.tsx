"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

function LoginForm() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect if already logged in
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/admin/rules");
    }
  }, [status, router]);

  // Show error from middleware redirect
  useEffect(() => {
    const err = params.get("error");
    if (err === "AccessDenied") setError("You don't have permission to access that page.");
    else if (err === "CredentialsSignin") setError("Invalid email or password.");
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Use NextAuth's callbackUrl so the cookie is set before redirect
    await signIn("credentials", {
      email: email.toLowerCase(),
      password,
      callbackUrl: "/admin/rules",
      redirect: true,
    });

    // If we reach here, sign-in failed
    setLoading(false);
    setError("Invalid email or password.");
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" label="Loading…" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #cc1111 0%, #991b1b 40%, #1e3a8a 100%)" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/15 mb-4">
            <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none">
              <polygon
                points="20,4 24,14 35,14 26.5,21 29.5,32 20,25 10.5,32 13.5,21 5,14 16,14"
                fill="white"
              />
            </svg>
          </div>
          <h1 className="text-white font-bold text-xl tracking-wide">
            AMERICAN CARPET WHOLESALERS
          </h1>
          <p className="text-red-200 text-sm mt-1">Admin Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 text-center">
            Sign in to continue
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="form-input"
                placeholder="admin@acwg.net"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn-primary w-full py-3 mt-2"
            >
              {loading ? (
                <><LoadingSpinner size="sm" /> Signing in…</>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            ACWG Fraud Verification Portal · Admin Access Only
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #cc1111 0%, #991b1b 40%, #1e3a8a 100%)" }}>
        <LoadingSpinner size="lg" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
