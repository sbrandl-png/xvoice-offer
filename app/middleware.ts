import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const USER = process.env.BASIC_AUTH_USER || "";
const PASS = process.env.BASIC_AUTH_PASS || "";

// Welche Pfade schützen?
const PROTECTED = ["/"]; // schützt alles unter /
// Wenn du z.B. /public-landing zulassen willst: nimm es einfach nicht in PROTECTED auf.

export function middleware(req: NextRequest) {
  // Nur in Production schützen (optional)
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const { pathname } = req.nextUrl;
  const shouldProtect = PROTECTED.some(p => pathname === p || pathname.startsWith(p + "/"));
  if (!shouldProtect) return NextResponse.next();

  const auth = req.headers.get("authorization") || "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
    if (u === USER && p === PASS) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="xVoice Offer"' },
  });
}

// Statische Assets & Next intern ausschließen
export const config = {
  matcher: [
    // alles außer Next-Assets
    "/((?!_next|favicon.ico|robots.txt|sitemap.xml|.*\\.(png|jpg|jpeg|gif|svg|ico|css|js|map)).*)",
  ],
};
