// /middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Konstantzeit-Vergleich, um Timing-Attacken zu vermeiden
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER || "";
  const pass = process.env.BASIC_AUTH_PASS || "";

  // Wenn Variablen nicht gesetzt → kein Schutz (absichtlich)
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization") || "";
  // Erwartet: "Basic base64(user:pass)"
  if (auth.startsWith("Basic ")) {
    const base64 = auth.slice(6);
    try {
      const decoded = Buffer.from(base64, "base64").toString("utf8");
      const i = decoded.indexOf(":");
      const u = i >= 0 ? decoded.slice(0, i) : "";
      const p = i >= 0 ? decoded.slice(i + 1) : "";
      if (safeEqual(u, user) && safeEqual(p, pass)) {
        return NextResponse.next();
      }
    } catch {
      // fällt unten auf 401 zurück
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="xVoice UC", charset="UTF-8"',
    },
  });
}

// Schutz für ALLE Pfade (inkl. /api). Nur Next-Assets & statische Dateien ausnehmen:
export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|map|txt|xml|webmanifest)).*)",
  ],
};
