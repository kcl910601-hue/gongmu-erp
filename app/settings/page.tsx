"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Employee = {
  id: number;
  name: string;
  position: string | null;
  active: boolean | null;
};

export default function SettingsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("업무담당자");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    setEmployees(data || []);
  }

  async function addEmployee() {
    if (isSaving) return;

    if (!name.trim()) {
      alert("담당자명을 입력하세요.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from("employees").insert([
      {
        name: name.trim(),
        position: position.trim() || "업무담당자",
        active: true,
      },
    ]);

    if (error) {
      alert(error.message);
      setIsSaving(false);
      return;
    }

    setName("");
    setPosition("업무담당자");
    setIsSaving(false);
    loadEmployees();
  }

  async function toggleEmployeeActive(employee: Employee) {
    const { error } = await supabase
      .from("employees")
      .update({
        active: !employee.active,
      })
      .eq("id", employee.id);

    if (error) {
      alert(error.message);
      return;
    }

    setEmployees((prev) =>
      prev.map((item) =>
        item.id === employee.id ? { ...item, active: !employee.active } : item
      )
    );
  }

  async function deleteEmployee(employee: Employee) {
    const confirmed = window.confirm(
      `${employee.name} 담당자를 삭제할까요? 이미 배정된 과거 업무에는 영향이 없지만, 목록에서는 사라집니다.`
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

    setEmployees((prev) => prev.filter((item) => item.id !== employee.id));
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">설정</h1>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">담당자 추가</h2>

        <div className="grid grid-cols-3 gap-3">
          <input
            className="border p-2 rounded"
            placeholder="담당자명"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="border p-2 rounded"
            placeholder="직책 / 역할"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />

          <button
            onClick={addEmployee}
            disabled={isSaving}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
          >
            {isSaving ? "저장 중..." : "추가"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-bold mb-4">담당자 관리</h2>

        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">이름</th>
              <th className="text-left p-2">직책 / 역할</th>
              <th className="text-left p-2">사용여부</th>
              <th className="text-left p-2">관리</th>
            </tr>
          </thead>

          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b">
                <td className="p-2">{employee.name}</td>
                <td className="p-2">{employee.position || "-"}</td>
                <td className="p-2">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm ${
                      employee.active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {employee.active ? "사용중" : "미사용"}
                  </span>
                </td>
                <td className="p-2 flex gap-2">
                  <button
                    onClick={() => toggleEmployeeActive(employee)}
                    className="border px-3 py-1 rounded"
                  >
                    {employee.active ? "미사용 처리" : "사용 처리"}
                  </button>

                  <button
                    onClick={() => deleteEmployee(employee)}
                    className="border px-3 py-1 rounded text-red-600"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}

            {employees.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-500">
                  등록된 담당자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}