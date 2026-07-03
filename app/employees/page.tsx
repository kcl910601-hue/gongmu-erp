"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Employee = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  position: string | null;
  role: string | null;
  phone: string | null;
  memo: string | null;
  is_active: boolean;
};

const roleLabels: Record<string, string> = {
  admin: "관리자",
  manager: "팀장",
  staff: "직원",
  viewer: "조회전용",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );

  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    department: "공무팀",
    position: "",
    role: "staff",
    phone: "",
    memo: "",
    is_active: true,
  });

  async function loadEmployees() {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setEmployees(data || []);
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const keyword = searchText.toLowerCase();

      const matchesSearch =
        employee.name.toLowerCase().includes(keyword) ||
        employee.email.toLowerCase().includes(keyword) ||
        (employee.position || "").toLowerCase().includes(keyword) ||
        (employee.department || "").toLowerCase().includes(keyword);

      const matchesRole =
        roleFilter === "all" || employee.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [employees, searchText, roleFilter]);

  function resetForm() {
    setSelectedEmployee(null);
    setForm({
      name: "",
      email: "",
      department: "공무팀",
      position: "",
      role: "staff",
      phone: "",
      memo: "",
      is_active: true,
    });
  }

  function selectEmployee(employee: Employee) {
    setSelectedEmployee(employee);
    setForm({
      name: employee.name,
      email: employee.email,
      department: employee.department || "공무팀",
      position: employee.position || "",
      role: employee.role || "staff",
      phone: employee.phone || "",
      memo: employee.memo || "",
      is_active: employee.is_active,
    });
  }

  async function saveEmployee() {
    if (!form.name.trim()) {
      alert("이름을 입력해주세요.");
      return;
    }

    if (!form.email.trim()) {
      alert("이메일을 입력해주세요.");
      return;
    }

    setLoading(true);

    if (selectedEmployee) {
      const { error } = await supabase
        .from("employees")
        .update({
          name: form.name,
          email: form.email,
          department: form.department,
          position: form.position,
          role: form.role,
          phone: form.phone,
          memo: form.memo,
          is_active: form.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedEmployee.id);

      setLoading(false);

      if (error) {
        alert(error.message);
        return;
      }

      alert("직원 정보가 수정되었습니다.");
    } else {
      const { error } = await supabase.from("employees").insert({
        name: form.name,
        email: form.email,
        department: form.department,
        position: form.position,
        role: form.role,
        phone: form.phone,
        memo: form.memo,
        is_active: form.is_active,
      });

      setLoading(false);

      if (error) {
        alert(error.message);
        return;
      }

      alert("직원이 추가되었습니다.");
    }

    resetForm();
    loadEmployees();
  }

  async function toggleActive(employee: Employee) {
    const { error } = await supabase
      .from("employees")
      .update({
        is_active: !employee.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", employee.id);

    if (error) {
      alert(error.message);
      return;
    }

    loadEmployees();
  }

  async function deleteEmployee(employee: Employee) {
    const confirmed = window.confirm(
      `${employee.name} 직원을 삭제하시겠습니까?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("id", employee.id);

    if (error) {
      alert(error.message);
      return;
    }

    if (selectedEmployee?.id === employee.id) {
      resetForm();
    }

    loadEmployees();
  }

  return (
    <main className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">직원관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            직원 정보, 권한, 활성 상태를 관리합니다.
          </p>
        </div>

        <button
          onClick={resetForm}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 신규 직원
        </button>
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          {selectedEmployee ? "직원 수정" : "직원 추가"}
        </h2>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            placeholder="이름"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          />

          <input
            value={form.email}
            onChange={(e) =>
              setForm({ ...form, email: e.target.value })
            }
            placeholder="이메일"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          />

          <input
            value={form.department}
            onChange={(e) =>
              setForm({ ...form, department: e.target.value })
            }
            placeholder="부서"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          />

          <input
            value={form.position}
            onChange={(e) =>
              setForm({ ...form, position: e.target.value })
            }
            placeholder="직급"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          />

          <input
            value={form.phone}
            onChange={(e) =>
              setForm({ ...form, phone: e.target.value })
            }
            placeholder="연락처"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          />

          <select
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value })
            }
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          >
            <option value="admin">관리자</option>
            <option value="manager">팀장</option>
            <option value="staff">직원</option>
            <option value="viewer">조회전용</option>
          </select>

          <select
            value={form.is_active ? "active" : "inactive"}
            onChange={(e) =>
              setForm({
                ...form,
                is_active: e.target.value === "active",
              })
            }
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          >
            <option value="active">사용중</option>
            <option value="inactive">비활성</option>
          </select>

          <button
            onClick={saveEmployee}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
          >
            {loading ? "저장 중..." : selectedEmployee ? "수정 저장" : "직원 추가"}
          </button>
        </div>

        <textarea
          value={form.memo}
          onChange={(e) => setForm({ ...form, memo: e.target.value })}
          placeholder="메모"
          className="mt-3 min-h-24 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
        />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">직원 목록</h2>

          <div className="flex gap-2">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="이름, 이메일, 부서, 직급 검색"
              className="w-72 rounded-xl border border-slate-300 px-4 py-2 text-sm"
            />

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
            >
              <option value="all">전체 권한</option>
              <option value="admin">관리자</option>
              <option value="manager">팀장</option>
              <option value="staff">직원</option>
              <option value="viewer">조회전용</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">부서</th>
                <th className="px-4 py-3">직급</th>
                <th className="px-4 py-3">권한</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-t border-slate-200 hover:bg-slate-50"
                >
                  <td
                    onClick={() => selectEmployee(employee)}
                    className="cursor-pointer px-4 py-3 font-medium text-blue-600"
                  >
                    {employee.name}
                  </td>
                  <td className="px-4 py-3">{employee.email}</td>
                  <td className="px-4 py-3">{employee.department || "-"}</td>
                  <td className="px-4 py-3">{employee.position || "-"}</td>
                  <td className="px-4 py-3">
                    {roleLabels[employee.role || "staff"]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        employee.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {employee.is_active ? "사용중" : "비활성"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(employee)}
                      className="mr-2 rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
                    >
                      {employee.is_active ? "비활성" : "활성"}
                    </button>

                    <button
                      onClick={() => deleteEmployee(employee)}
                      className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}

              {filteredEmployees.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    표시할 직원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}