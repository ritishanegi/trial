import { cookies } from "next/headers";
import { verifyToken, type TokenPayload } from "./index";

const COOKIE_NAME = "nautos_token";

export async function getSession(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyToken(token);
}
