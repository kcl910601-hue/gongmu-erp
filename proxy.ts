import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEmployeeByAuth } from "@/lib/auth";
import { canCalendarOnlyStaffAccessApi, canEmployeeAccessRoute, isAuthorizedEmployee, isCalendarOnlyStaff } from "@/lib/permissions";

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
  if (!user && isApi) return response;
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { employee } = await getEmployeeByAuth(supabase, user);

  if (!isAuthorizedEmployee(employee)) {
    const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie.name, cookie.value)
    );
    return redirectResponse;
  }

  if (isApi && isCalendarOnlyStaff(employee) && !canCalendarOnlyStaffAccessApi(request.nextUrl.pathname, request.method)) {
    return NextResponse.json({ error: "스태프 계정은 Calendar 조회 전용입니다." }, { status: 403 });
  }

  if (!isApi && !canEmployeeAccessRoute(employee, request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL(isCalendarOnlyStaff(employee) ? "/calendar" : "/forbidden", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
