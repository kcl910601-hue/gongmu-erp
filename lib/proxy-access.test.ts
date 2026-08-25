import assert from "node:assert/strict";
import test from "node:test";
import type { CurrentEmployee } from "./auth.ts";
import { createProxyApiErrorResponse, decideProxyAccess } from "./proxy-access.ts";

const approvedEmployee: CurrentEmployee = {
  id: 1,
  name: "승인 직원",
  email: "approved@example.com",
  position: "과장",
  role: "staff",
  active: true,
  approval_status: "approved",
  auth_user_id: "auth-1",
  organization: { id: 1, name: "공무팀" },
};

const calendarOnlyEmployee: CurrentEmployee = {
  ...approvedEmployee,
  position: "스태프",
  organization: { id: 19, name: "기타" },
};

function decide(overrides: Partial<Parameters<typeof decideProxyAccess>[0]> = {}) {
  return decideProxyAccess({
    isApi: true,
    pathname: "/api/sharing",
    method: "GET",
    isAuthenticated: true,
    employee: approvedEmployee,
    employeeLookupError: null,
    ...overrides,
  });
}

test("비로그인 페이지는 login으로 redirect하고 API는 401 JSON을 반환한다", async () => {
  assert.deepEqual(decide({ isApi: false, pathname: "/projects", isAuthenticated: false, employee: null }), {
    type: "redirect",
    pathname: "/login",
  });
  const decision = decide({ isAuthenticated: false, employee: null });
  assert.deepEqual(decision, {
    type: "api-error",
    status: 401,
    body: { error: "UNAUTHORIZED", message: "로그인이 필요합니다." },
  });
  if (decision.type !== "api-error") return;
  const response = createProxyApiErrorResponse(decision);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), decision.body);
});

test("승인 직원은 sharing과 reference-tasks API를 통과한다", () => {
  assert.deepEqual(decide({ pathname: "/api/sharing" }), { type: "continue" });
  assert.deepEqual(decide({ pathname: "/api/reference-tasks" }), { type: "continue" });
});

test("직원 없음은 403, 직원 조회 오류는 500 JSON으로 구분한다", () => {
  assert.deepEqual(decide({ employee: null }), {
    type: "api-error",
    status: 403,
    body: { error: "ERP_ACCESS_DENIED", message: "ERP 접근 권한이 없습니다." },
  });
  assert.deepEqual(decide({ employee: null, employeeLookupError: "database unavailable" }), {
    type: "api-error",
    status: 500,
    body: { error: "EMPLOYEE_LOOKUP_FAILED", message: "사용자 권한 정보를 확인하지 못했습니다." },
  });
});

test("Calendar-only 직원은 허용된 조회만 통과하고 sharing 및 statistics API는 403이다", () => {
  assert.deepEqual(decide({ employee: calendarOnlyEmployee, pathname: "/api/reference-tasks" }), { type: "continue" });
  for (const pathname of ["/api/sharing", "/api/statistics/lme"]) {
    const decision = decide({ employee: calendarOnlyEmployee, pathname });
    assert.equal(decision.type, "api-error");
    if (decision.type === "api-error") assert.equal(decision.status, 403);
  }
  const mutation = decide({ employee: calendarOnlyEmployee, pathname: "/api/reference-tasks", method: "POST" });
  assert.equal(mutation.type, "api-error");
});

test("기존 페이지 권한 redirect 정책을 유지한다", () => {
  assert.deepEqual(decide({ isApi: false, pathname: "/projects", employee: calendarOnlyEmployee }), {
    type: "redirect",
    pathname: "/calendar",
  });
  assert.deepEqual(decide({ isApi: false, pathname: "/projects" }), { type: "continue" });
  assert.deepEqual(decide({ isApi: false, pathname: "/projects", employee: null, employeeLookupError: "timeout" }), {
    type: "redirect",
    pathname: "/forbidden",
  });
});
