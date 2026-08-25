import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEmployeeByAuth } from "@/lib/auth";
import { createProxyApiErrorResponse, decideProxyAccess } from "@/lib/proxy-access";

const PUBLIC_PATHS = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  // Public auth pages must render even when Supabase is temporarily slow.
  // Login performs its own auth flow and protected pages remain guarded below.
  if (isPublic) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const employeeResult = user
    ? await getEmployeeByAuth(supabase, user)
    : { employee: null, error: null };
  const decision = decideProxyAccess({
    isApi,
    pathname: request.nextUrl.pathname,
    method: request.method,
    isAuthenticated: Boolean(user),
    employee: employeeResult.employee,
    employeeLookupError: employeeResult.error,
  });

  if (decision.type === "api-error") {
    const apiResponse = createProxyApiErrorResponse(decision);
    response.headers.getSetCookie().forEach((cookie) => apiResponse.headers.append("set-cookie", cookie));
    return apiResponse;
  }

  if (decision.type === "redirect") {
    const redirectResponse = NextResponse.redirect(new URL(decision.pathname, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie.name, cookie.value));
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
