"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";


export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (res.ok) {
      router.push("/dashboard");
    } else {
      const data = await res.json();
      setError(data.error || "Login failed");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen font-sans">
      {/* ── Left — brand panel ── */}
      <div className="hidden lg:flex lg:w-[400px] flex-col justify-between p-10 relative overflow-hidden bg-[#0a1628]">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 60% 110%, rgba(255,165,0,0.08) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full border-2 border-[#f5a623] flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full border border-[#f5a623]" />
          </div>
          <span className="text-white text-[15px] font-semibold tracking-wide">
            nautos
          </span>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <span className="h-px w-8 bg-[#f5a623]" />
            <span className="text-[#f5a623] text-[11px] tracking-[0.12em] uppercase">
              Maritime Intelligence Platform
            </span>
            <span className="h-px w-8 bg-[#f5a623]" />
          </div>
          <h1 className="text-white text-[26px] font-bold leading-tight">
            Maritime document
            <br />
            <em className="text-white/70">intelligence.</em>
          </h1>
          <p className="mt-3 text-sm text-white/50 leading-relaxed">
            Upload manuals. Ask questions. Get answers with page citations.
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-[10px] tracking-widest text-white/20">
            25°47′N 80°13′W
          </p>
          <p className="mt-1.5 text-[11px] tracking-wider text-white/25">
            Martech Systems
          </p>
        </div>
      </div>

      {/* ── Right — form with ship background ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden bg-[#0d1a2e]">
        {/* Standard HTML Image tag - Bypasses Next.js optimization issues entirely */}
        <img
          src="/images/ship.jpg"
          alt="Ship background"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />

        {/* Dark overlay so the form stays legible */}
        <div className="absolute inset-0 bg-[#0d1a2e]/60 backdrop-blur-[2px] z-10" />

        {/* Form container sits on top */}
        <div className="relative z-20 w-full max-w-[420px]">
          <h2 className="text-[#f0f4ff] text-xl font-semibold">Log in</h2>
          <p className="mt-1 mb-7 text-sm text-white/40">
            Enter your credentials to access your dashboard.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[11px] uppercase tracking-[0.04em] text-white/50"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-[#f0f4ff] outline-none placeholder:text-white/20 transition-colors focus:border-[#f5a623]/50"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="password"
                  className="block text-[11px] uppercase tracking-[0.04em] text-white/50"
                >
                  Password
                </label>
              </div>
              <div className="relative group">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Password"
                  className="w-full bg-white/5 border border-white/10 rounded-md pl-3 pr-10 py-2 text-sm text-[#f0f4ff] outline-none placeholder:text-white/20 transition-colors focus:border-[#f5a623]/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 rounded-md bg-[#f5a623] hover:bg-[#e8971a] disabled:opacity-60 text-[#0a1628] text-sm font-bold tracking-widest uppercase transition-colors cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#0a1628] border-t-transparent" />
                  Logging in…
                </span>
              ) : (
                "Log in"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/40">
            No account?{" "}
            <Link
              href="/auth/register"
              className="text-white/70 hover:underline"
            >
              Register your company
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}