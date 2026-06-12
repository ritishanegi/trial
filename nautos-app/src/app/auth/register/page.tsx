"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
// Using Lucide icons for the toggle (standard in many Next.js setups)
import { Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirmPassword") as string;

    if (password !== confirm) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password,
        name: form.get("name"),
        companyName: form.get("companyName"),
        subdomain: form.get("subdomain"),
      }),
    });

    if (res.ok) {
      router.push("/dashboard");
    } else {
      const data = await res.json();
      setError(data.error || "Registration failed");
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
            Set up your company
            <br />
            <em className="text-white/70">in two minutes.</em>
          </h1>
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

      {/* ── Right — form ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden bg-[#0d1a2e]">
        <img
          src="/images/ship.jpg"
          alt="Ship background"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        <div className="absolute inset-0 bg-[#0d1a2e]/60 backdrop-blur-[2px] z-10" />
        <div className="relative z-20 w-full max-w-[420px]">
          <h2 className="text-[#f0f4ff] text-xl font-semibold">
            Create account
          </h2>
          <p className="mt-1 mb-7 text-sm text-white/40">
            Register your company to get started with NAUTOS.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" id="name">
                <input
                  id="name"
                  name="name"
                  required
                  minLength={2}
                  placeholder="John Smith"
                />
              </Field>
              <Field label="Email" id="email">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                />
              </Field>
            </div>

            <Field label="Company name" id="companyName">
              <input
                id="companyName"
                name="companyName"
                required
                minLength={2}
                placeholder="Acme Shipping Ltd"
              />
            </Field>

            <div className="space-y-1.5">
              <label
                htmlFor="subdomain"
                className="block text-[11px] uppercase tracking-[0.04em] text-white/50"
              >
                Subdomain
              </label>
              <div className="flex rounded-md border border-white/10 focus-within:border-[#f5a623]/50 overflow-hidden transition-colors">
                <input
                  id="subdomain"
                  name="subdomain"
                  required
                  minLength={3}
                  maxLength={63}
                  pattern="[a-z0-9-]+"
                  placeholder="acme-shipping"
                  className="flex-1 bg-white/5 px-3 py-2 text-sm text-[#f0f4ff] outline-none placeholder:text-white/20"
                />
                <span className="flex items-center px-3 bg-white/[0.04] border-l border-white/[0.08] text-white/40 text-sm whitespace-nowrap select-none">
                  .nautos.ai
                </span>
              </div>
            </div>

            {/* Password + Confirm using the new PasswordInput component */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Password" id="password">
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="Min 8 chars"
                />
              </Field>
              <Field label="Confirm" id="confirmPassword">
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="Repeat"
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 rounded-md bg-[#f5a623] hover:bg-[#e8971a] disabled:opacity-60 text-[#0a1628] text-sm font-bold tracking-widest uppercase transition-colors cursor-pointer"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/40">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-white/70 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Password Input Sub-component ── */

function PasswordInput({ id, name, placeholder }: { id: string; name: string; placeholder: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative flex items-center">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        required
        minLength={8}
        placeholder={placeholder}
        className="pr-10" // Make room for the icon
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 text-white/30 hover:text-white/60 transition-colors focus:outline-none"
        tabIndex={-1} // Prevent tabbing into the toggle for faster form flow
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/* ── Field Wrapper ── */

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-[11px] uppercase tracking-[0.04em] text-white/50"
      >
        {label}
      </label>
      <div
        className="
          [&_input]:w-full
          [&_input]:bg-white/5
          [&_input]:border
          [&_input]:border-white/10
          [&_input]:rounded-md
          [&_input]:px-3
          [&_input]:py-2
          [&_input]:text-sm
          [&_input]:text-[#f0f4ff]
          [&_input]:outline-none
          [&_input]:placeholder:text-white/20
          [&_input]:transition-colors
          [&_input:focus]:border-[#f5a623]/50
        "
      >
        {children}
      </div>
    </div>
  );
}