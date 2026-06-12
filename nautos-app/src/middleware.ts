import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth/jwt-secret";

const PUBLIC_PATHS = ["/", "/api/auth/login", "/api/auth/register", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/api/auth/"))) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("nautos_token")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);

    const headers = new Headers(req.headers);
    headers.set("x-user-id", payload.userId as string);
    headers.set("x-tenant-id", payload.tenantId as string);
    headers.set("x-user-role", payload.role as string);

    return NextResponse.next({ request: { headers } });
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }
}

export const config = {
  matcher: [
    // ✅ Add |images right after favicon.ico
    '/((?!_next/static|_next/image|favicon.ico|images).*)',
  ],
};
