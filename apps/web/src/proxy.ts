import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";

// Rotas acessíveis sem sessão (lista documentada em docs/DEPLOY.md):
// - /login        — tela de entrada; o auto-cadastro é uma ABA dela (não há /signup)
// - /acesso-negado — destino dos redirects de permissão (evita loop com /login)
// - /api/health   — monitoramento/uptime (não toca no banco)
// - /api/cron   — disparado pelo agendador da Vercel (não tem cookie de sessão);
//                 protegido por CRON_SECRET dentro da própria rota
const PUBLIC_PATHS = ["/login", "/acesso-negado", "/api/health", "/api/cron"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("de", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();

  // Sliding refresh: renova o cookie quando mais de 50% do TTL já foi consumido.
  // O proxy só confere a assinatura — a validação contra o banco (revogação,
  // status, sessionVersion) acontece em lib/auth/session-server.ts.
  if (session?.exp) {
    const remaining = session.exp - Math.floor(Date.now() / 1000);
    if (remaining > 0 && remaining < SESSION_TTL_SECONDS / 2) {
      const renewed = await createSessionToken({ userId: session.userId, sv: session.sv });
      response.cookies.set(SESSION_COOKIE, renewed, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_TTL_SECONDS,
        path: "/",
      });
    }
  }

  return response;
}

export const config = {
  // Protege tudo, exceto assets estáticos do Next
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
