import type { CurrentEmployee } from "./auth.ts";
import {
  canCalendarOnlyStaffAccessApi,
  canEmployeeAccessRoute,
  isAuthorizedEmployee,
  isCalendarOnlyStaff,
} from "./permissions.ts";

export type ProxyApiError = {
  error: "UNAUTHORIZED" | "ERP_ACCESS_DENIED" | "EMPLOYEE_LOOKUP_FAILED";
  message: string;
};

export type ProxyAccessDecision =
  | { type: "continue" }
  | { type: "redirect"; pathname: "/login" | "/calendar" | "/forbidden" }
  | { type: "api-error"; status: 401 | 403 | 500; body: ProxyApiError };

type ProxyAccessInput = {
  isApi: boolean;
  pathname: string;
  method: string;
  isAuthenticated: boolean;
  employee: CurrentEmployee | null;
  employeeLookupError: string | null;
};

export function decideProxyAccess({
  isApi,
  pathname,
  method,
  isAuthenticated,
  employee,
  employeeLookupError,
}: ProxyAccessInput): ProxyAccessDecision {
  if (!isAuthenticated) {
    return isApi
      ? { type: "api-error", status: 401, body: { error: "UNAUTHORIZED", message: "로그인이 필요합니다." } }
      : { type: "redirect", pathname: "/login" };
  }

  if (employeeLookupError) {
    return isApi
      ? { type: "api-error", status: 500, body: { error: "EMPLOYEE_LOOKUP_FAILED", message: "사용자 권한 정보를 확인하지 못했습니다." } }
      : { type: "redirect", pathname: "/forbidden" };
  }

  if (!isAuthorizedEmployee(employee)) {
    return isApi
      ? { type: "api-error", status: 403, body: { error: "ERP_ACCESS_DENIED", message: "ERP 접근 권한이 없습니다." } }
      : { type: "redirect", pathname: "/login" };
  }

  if (isApi && isCalendarOnlyStaff(employee) && !canCalendarOnlyStaffAccessApi(pathname, method)) {
    return { type: "api-error", status: 403, body: { error: "ERP_ACCESS_DENIED", message: "ERP 접근 권한이 없습니다." } };
  }

  if (!isApi && !canEmployeeAccessRoute(employee, pathname)) {
    return { type: "redirect", pathname: isCalendarOnlyStaff(employee) ? "/calendar" : "/forbidden" };
  }

  return { type: "continue" };
}

export function createProxyApiErrorResponse(decision: Extract<ProxyAccessDecision, { type: "api-error" }>) {
  return Response.json(decision.body, { status: decision.status });
}
