"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

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
    <div className="min-h-screen flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-[480px] bg-primary text-primary-foreground flex-col justify-between p-10">
        <span className="text-[15px] font-semibold tracking-tight">nautos</span>
        <div>
          <p className="text-2xl font-semibold leading-snug">
            Set up your company
            <br />
            in two minutes.
          </p>
          <p className="mt-3 text-sm text-primary-foreground/60 leading-relaxed">
            Create your workspace, add vessels, and start uploading documents immediately.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/40">Martech Systems</p>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-foreground">Create account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Register your company to get started with NAUTOS.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required minLength={2} placeholder="John Smith" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="you@company.com" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="companyName">Company name</Label>
              <Input id="companyName" name="companyName" required minLength={2} placeholder="Acme Shipping Ltd" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subdomain">Subdomain</Label>
              <div className="flex">
                <Input
                  id="subdomain"
                  name="subdomain"
                  required
                  minLength={3}
                  maxLength={63}
                  pattern="[a-z0-9-]+"
                  placeholder="acme-shipping"
                  className="rounded-r-none border-r-0"
                />
                <div className="flex items-center px-3 rounded-r-md border border-input bg-muted text-sm text-muted-foreground whitespace-nowrap">
                  .nautos.ai
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required minLength={8} placeholder="Min 8 chars" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} placeholder="Repeat" />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-medium text-foreground hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
