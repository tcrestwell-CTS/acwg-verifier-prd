"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  // Clear form on mount to prevent browser autofill showing previous user
  useEffect(() => {
    setEmail("");
    setPassword("");
  }, []);

  useEffect(() => {
    if (status === "authenticated") router.replace("/orders/new");
  }, [status, router]);

  useEffect(() => {
    const err = params.get("error");
    if (err === "CredentialsSignin") setError("Invalid email or password.");
    if (err === "AccessDenied") setError("You don't have access to that area.");
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await signIn("credentials", {
      email: email.toLowerCase(),
      password,
      callbackUrl: "/orders/new",
      redirect: true,
    });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: "linear-gradient(90deg, #cc1111 0%, #b91c1c 20%, #ffffff 50%, #1e3a8a 80%, #1a2f6e 100%)"
    }}>

      <div className="relative z-10 flex flex-col flex-1 items-center justify-center px-4 py-12">

        {/* Logo mark */}
        <div className="mb-10 flex flex-col items-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full blur-2xl opacity-50" style={{
              background: "radial-gradient(circle, #cc1111, transparent)"
            }} />
            <svg viewBox="0 0 80 80" className="w-20 h-20 relative" fill="none">
              <circle cx="40" cy="40" r="38" stroke="#cc1111" strokeWidth="1.5" opacity="0.4" />
              <circle cx="40" cy="40" r="30" stroke="#1e3a8a" strokeWidth="1" opacity="0.3" />
              <polygon
                points="40,14 45,28 60,28 48,37 52,51 40,43 28,51 32,37 20,28 35,28"
                fill="white"
                opacity="0.95"
              />
            </svg>
          </div>

          <div className="text-center">
            <p className="text-white font-black text-lg tracking-[0.2em] uppercase" style={{
              fontFamily: "'Georgia', serif",
              letterSpacing: "0.25em"
            }}>
              American Carpet Wholesalers
            </p>
            <div className="flex items-center gap-3 mt-2 justify-center">
              <div className="h-px w-8" style={{ background: "#cc1111" }} />
              <p className="text-xs tracking-[0.3em] uppercase" style={{ color: "#8a9ab5" }}>
                Fraud Verification Portal
              </p>
              <div className="h-px w-8" style={{ background: "#cc1111" }} />
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm">
          <div className="relative rounded-2xl overflow-hidden" style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(204,17,17,0.1)"
          }}>
            {/* Card top accent */}
            <div className="h-0.5 w-full" style={{
              background: "linear-gradient(90deg, transparent, #cc1111, transparent)"
            }} />

            <div className="p-8">
              <h2 className="text-white font-semibold text-xl mb-1" style={{ fontFamily: "'Georgia', serif" }}>
                Sales Rep Access
              </h2>
              <p className="text-sm mb-8" style={{ color: "#8a9ab5" }}>
                Sign in to verify and process orders
              </p>

              {error && (
                <div className="mb-6 px-4 py-3 rounded-lg text-sm font-medium" style={{
                  background: "rgba(204,17,17,0.15)",
                  border: "1px solid rgba(204,17,17,0.3)",
                  color: "#ff8080"
                }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email field */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8a9ab5" }}>
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocused("email")}
                      onBlur={() => setFocused(null)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: `1px solid ${focused === "email" ? "#cc1111" : "rgba(255,255,255,0.1)"}`,
                        color: "white",
                        boxShadow: focused === "email" ? "0 0 0 3px rgba(204,17,17,0.15)" : "none"
                      }}
                    />
                  </div>
                </div>

                {/* Password field */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8a9ab5" }}>
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${focused === "password" ? "#cc1111" : "rgba(255,255,255,0.1)"}`,
                      color: "white",
                      boxShadow: focused === "password" ? "0 0 0 3px rgba(204,17,17,0.15)" : "none"
                    }}
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full py-3.5 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-200 mt-2"
                  style={{
                    background: loading || !email || !password
                      ? "rgba(204,17,17,0.3)"
                      : "linear-gradient(135deg, #cc1111, #991b1b)",
                    color: loading || !email || !password ? "rgba(255,255,255,0.4)" : "white",
                    boxShadow: loading || !email || !password
                      ? "none"
                      : "0 4px 20px rgba(204,17,17,0.4)",
                    cursor: loading || !email || !password ? "not-allowed" : "pointer"
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing in…
                    </span>
                  ) : "Sign In"}
                </button>
              </form>
            </div>

            {/* Card bottom */}
            <div className="px-8 py-4 flex items-center justify-between" style={{
              background: "rgba(0,0,0,0.2)",
              borderTop: "1px solid rgba(255,255,255,0.05)"
            }}>
              <p className="text-xs" style={{ color: "#64748b" }}>
                Authorized personnel only
              </p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs" style={{ color: "#64748b" }}>Secure</span>
              </div>
            </div>
          </div>

          {/* Admin link */}
          <p className="text-center mt-6 text-xs" style={{ color: "#64748b" }}>
            Admin?{" "}
            <a href="/admin/login" className="transition-colors" style={{ color: "#7a9fc7" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#a0c0e8")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#7a9fc7")}
            >
              Admin portal →
            </a>
          </p>
        </div>

        {/* Footer */}
        <p className="relative z-10 mt-12 text-xs text-center text-white/60">
          © 2026 Crestwell Travel Technologies, LLC · Service created and managed by Crestwell Travel Technologies
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{
        background: "linear-gradient(160deg, #0f0f0f 0%, #1a0a0a 40%, #0a0f1e 100%)"
      }}>
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
