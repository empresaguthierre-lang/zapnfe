import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/pedidos", "/clientes", "/produtos", "/notas-fiscais", "/configuracoes", "/erp"];

function isProtectedPath(pathname: string) {
  return pathname === "/" || protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getSupabaseOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co") ? url.origin : null;
  } catch {
    return null;
  }
}

function applySecurityHeaders(response: NextResponse, contentSecurityPolicy: string) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const supabaseOrigin = getSupabaseOrigin();
  const trustedOrigin = supabaseOrigin ? ` ${supabaseOrigin}` : "";
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-inline'" : ""}`,
    `img-src 'self' data: blob:${trustedOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self'${trustedOrigin}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const requiresAuthentication = isProtectedPath(request.nextUrl.pathname);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (requiresAuthentication && (!supabaseUrl || !publishableKey)) {
    return applySecurityHeaders(new NextResponse("Serviço de autenticação indisponível.", { status: 503 }), contentSecurityPolicy);
  }

  if (supabaseUrl && publishableKey) {
    const supabase = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, authHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(authHeaders).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    });

    const { data, error } = await supabase.auth.getClaims();
    if (requiresAuthentication && (error || !data?.claims)) {
      const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      for (const header of ["cache-control", "expires", "pragma"]) {
        const value = response.headers.get(header);
        if (value) redirectResponse.headers.set(header, value);
      }
      return applySecurityHeaders(redirectResponse, contentSecurityPolicy);
    }
  }

  return applySecurityHeaders(response, contentSecurityPolicy);
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
