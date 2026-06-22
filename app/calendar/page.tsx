"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: number;
  project_name: string;
  task_manager: string | null;
  completion_due_date: string | null;
  status: string | null;
};

type Shipment = {
  id: number;
  site_name: string;
  item_name: string;
  shipment_date: string | null;
  status: string | null;
};

type Task = {
  id: number;
  project_id: number;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  completed_date: string | null;
};

type CalendarItem = {
  id: string;
  date: string;
  type: "준공예정" | "출고예정" | "업무완료";
  title: string;
  status: string | null;
  assignee: string;
  href?: string;
};

const typeList = ["전체", "준공예정", "출고예정", "업무완료"];
const viewList = ["달력 보기", "타임라인 보기"];

export default function CalendarPage() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [editDate, setEditDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [viewMode, setViewMode] = useState("달력 보기");
  const [currentMonth, setCurrentMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDate, setIsSavingDate] = useState(false);

  useEffect(() => {
    loadCalendar();
  }, []);

  async function loadCalendar() {
    setIsLoading(true);

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, project_name, task_manager, completion_due_date, status");

    if (projectError) {
      alert(projectError.message);
      setIsLoading(false);
      return;
    }

    const { data: shipmentData, error: shipmentError } = await supabase
      .from("shipments")
      .select("id, site_name, item_name, shipment_date, status");

    if (shipmentError) {
      alert(shipmentError.message);
      setIsLoading(false);
      return;
    }

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("id, project_id, task_name, task_type, assignee, completed_date");

    if (taskError) {
      alert(taskError.message);
      setIsLoading(false);
      return;
    }

    const projectItems: CalendarItem[] = ((projectData || []) as Project[])
      .filter((project) => project.completion_due_date)
      .map((project) => ({
        id: `project-${project.id}`,
        date: project.completion_due_date as string,
        type: "준공예정",
        title: project.project_name,
        status: project.status,
        assignee: project.task_manager || "미지정",
        href: `/projects/${project.id}`,
      }));

    const shipmentItems: CalendarItem[] = ((shipmentData || []) as Shipment[])
      .filter((shipment) => shipment.shipment_date)
      .map((shipment) => ({
        id: `shipment-${shipment.id}`,
        date: shipment.shipment_date as string,
        type: "출고예정",
        title: `${shipment.site_name} / ${shipment.item_name}`,
        status: shipment.status,
        assignee: "미지정",
        href: "/shipments",
      }));

    const taskItems: CalendarItem[] = ((taskData || []) as Task[])
      .filter((task) => task.completed_date)
      .map((task) => ({
        id: `task-${task.id}`,
        date: task.completed_date as string,
        type: "업무완료",
        title: `${task.task_name || "-"} / ${task.task_type || "-"}`,
        status: "완료",
        assignee: task.assignee || "미지정",
        href: `/projects/${task.project_id}`,
      }));

    const mergedItems = [...projectItems, ...shipmentItems, ...taskItems].sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    setItems(mergedItems);
    setIsLoading(false);
  }

  function openItemModal(item: CalendarItem) {
    setSelectedItem(item);
    setEditDate(item.date);
  }

  async function updateCalendarDate() {
    if (!selectedItem) return;

    if (!editDate) {
      alert("변경할 날짜를 선택하세요.");
      return;
    }

    if (selectedItem.type === "업무완료") {
      alert("업무완료일은 업무 상태 변경으로 관리하는 값입니다.");
      return;
    }

    setIsSavingDate(true);

    let error = null;

    if (selectedItem.type === "준공예정") {
      const projectId = Number(selectedItem.id.replace("project-", ""));

      const result = await supabase
        .from("projects")
        .update({
          completion_due_date: editDate,
        })
        .eq("id", projectId);

      error = result.error;
    }

    if (selectedItem.type === "출고예정") {
      const shipmentId = Number(selectedItem.id.replace("shipment-", ""));

      const result = await supabase
        .from("shipments")
        .update({
          shipment_date: editDate,
        })
        .eq("id", shipmentId);

      error = result.error;
    }

    if (error) {
      alert(error.message);
      setIsSavingDate(false);
      return;
    }

    setSelectedItem(null);
    setEditDate("");
    setIsSavingDate(false);
    await loadCalendar();
  }

  function getTypeStyle(type: string) {
    if (type === "준공예정") {
      return "bg-blue-100 text-blue-700 border-blue-300";
    }

    if (type === "출고예정") {
      return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }

    return "bg-green-100 text-green-700 border-green-300";
  }

  function moveMonth(direction: "prev" | "next") {
    const [year, month] = currentMonth.split("-").map(Number);
    const baseDate = new Date(year, month - 1, 1);

    if (direction === "prev") {
      baseDate.setMonth(baseDate.getMonth() - 1);
    } else {
      baseDate.setMonth(baseDate.getMonth() + 1);
    }

    setCurrentMonth(baseDate.toISOString().slice(0, 7));
  }

  function getCalendarDays() {
    const [year, month] = currentMonth.split("-").map(Number);
    const firstDate = new Date(year, month - 1, 1);
    const lastDate = new Date(year, month, 0);

    const startDay = firstDate.getDay();
    const totalDays = lastDate.getDate();

    const days: (string | null)[] = [];

    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      days.push(`${currentMonth}-${String(day).padStart(2, "0")}`);
    }

    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }

  const assigneeList = useMemo(() => {
    const names = items.map((item) => item.assignee);
    return ["전체", ...Array.from(new Set(names))];
  }, [items]);

  const filteredItems = items.filter((item) => {
    const typeMatched = typeFilter === "전체" || item.type === typeFilter;
    const assigneeMatched =
      assigneeFilter === "전체" || item.assignee === assigneeFilter;

    return typeMatched && assigneeMatched;
  });

  const groupedItems = useMemo(() => {
    const grouped: Record<string, CalendarItem[]> = {};

    filteredItems.forEach((item) => {
      if (!grouped[item.date]) {
        grouped[item.date] = [];
      }

      grouped[item.date].push(item);
    });

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  function getDateItems(date: string) {
    return filteredItems.filter((item) => item.date === date);
  }

  const today = new Date().toISOString().slice(0, 10);
  const calendarDays = getCalendarDays();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">캘린더</h1>

        <button
          onClick={loadCalendar}
          className="bg-slate-700 text-white px-4 py-2 rounded"
        >
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">조회 일정</h3>
          <p className="text-3xl font-bold">{filteredItems.length}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">준공예정</h3>
          <p className="text-3xl font-bold text-blue-600">
            {filteredItems.filter((item) => item.type === "준공예정").length}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">출고예정</h3>
          <p className="text-3xl font-bold text-yellow-600">
            {filteredItems.filter((item) => item.type === "출고예정").length}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">오늘 일정</h3>
          <p className="text-3xl font-bold text-purple-600">
            {filteredItems.filter((item) => item.date === today).length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="font-bold">보기 방식</div>

          <div className="flex gap-2">
            {viewList.map((view) => (
              <button
                key={view}
                onClick={() => setViewMode(view)}
                className={`px-4 py-2 rounded border ${
                  viewMode === view
                    ? "bg-slate-800 text-white"
                    : "bg-white text-gray-700"
                }`}
              >
                {view}
              </button>
            ))}
          </div>

          <div className="font-bold ml-4">일정 구분</div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border p-2 rounded"
          >
            {typeList.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <div className="font-bold ml-4">담당자</div>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="border p-2 rounded"
          >
            {assigneeList.map((assignee) => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
          불러오는 중...
        </div>
      ) : viewMode === "달력 보기" ? (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => moveMonth("prev")}
              className="border px-4 py-2 rounded"
            >
              이전달
            </button>

            <h2 className="text-xl font-bold">{currentMonth}</h2>

            <button
              onClick={() => moveMonth("next")}
              className="border px-4 py-2 rounded"
            >
              다음달
            </button>
          </div>

          <div className="grid grid-cols-7 border-t border-l">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
              <div
                key={day}
                className="border-r border-b p-2 text-center font-bold bg-gray-50"
              >
                {day}
              </div>
            ))}

            {calendarDays.map((date, index) => {
              const dateItems = date ? getDateItems(date) : [];

              return (
                <div
                  key={index}
                  className={`border-r border-b min-h-[130px] p-2 ${
                    date === today ? "bg-purple-50" : "bg-white"
                  }`}
                >
                  {date && (
                    <>
                      <div className="font-bold text-sm mb-2">
                        {Number(date.slice(-2))}
                        {date === today && (
                          <span className="ml-1 text-purple-600">오늘</span>
                        )}
                      </div>

                      <div className="space-y-1">
                        {dateItems.slice(0, 4).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => openItemModal(item)}
                            className={`block w-full text-left truncate text-xs border rounded px-2 py-1 ${getTypeStyle(
                              item.type
                            )}`}
                          >
                            {item.type} · {item.title}
                          </button>
                        ))}

                        {dateItems.length > 4 && (
                          <div className="text-xs text-gray-500">
                            +{dateItems.length - 4}건 더 있음
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-6">타임라인</h2>

          {groupedItems.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              조회된 일정이 없습니다.
            </div>
          ) : (
            <div className="relative border-l-2 border-gray-300 ml-4 space-y-8">
              {groupedItems.map(([date, dateItems]) => (
                <div key={date} className="relative pl-8">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-700" />

                  <div className="mb-3">
                    <span className="text-lg font-bold">{date}</span>
                    {date === today && (
                      <span className="ml-2 text-sm text-purple-600 font-bold">
                        오늘
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {dateItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => openItemModal(item)}
                        className="block w-full text-left bg-gray-50 border rounded-xl p-4 hover:bg-gray-100"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span
                              className={`inline-block px-2 py-1 rounded border text-sm mr-3 ${getTypeStyle(
                                item.type
                              )}`}
                            >
                              {item.type}
                            </span>

                            <span className="font-medium">{item.title}</span>
                          </div>

                          <div className="text-sm text-gray-500">
                            담당자: {item.assignee}
                          </div>
                        </div>

                        <div className="mt-2 text-sm text-gray-500">
                          상태: {item.status || "-"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[600px] p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">일정 상세</h2>

              <button
                onClick={() => {
                  setSelectedItem(null);
                  setEditDate("");
                }}
                className="text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-gray-500 text-sm">일정명</div>
                <div className="font-medium">{selectedItem.title}</div>
              </div>

              <div>
                <div className="text-gray-500 text-sm">구분</div>
                <span
                  className={`inline-block px-2 py-1 rounded border text-sm ${getTypeStyle(
                    selectedItem.type
                  )}`}
                >
                  {selectedItem.type}
                </span>
              </div>

              <div>
                <div className="text-gray-500 text-sm">담당자</div>
                <div>{selectedItem.assignee}</div>
              </div>

              <div>
                <div className="text-gray-500 text-sm">상태</div>
                <div>{selectedItem.status || "-"}</div>
              </div>

              <div>
                <div className="text-gray-500 text-sm">일정일</div>

                {selectedItem.type === "업무완료" ? (
                  <div>{selectedItem.date}</div>
                ) : (
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="border p-2 rounded w-full"
                  />
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setSelectedItem(null);
                  setEditDate("");
                }}
                className="border px-4 py-2 rounded"
              >
                닫기
              </button>

              {selectedItem.type !== "업무완료" && (
                <button
                  onClick={updateCalendarDate}
                  disabled={isSavingDate}
                  className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
                >
                  {isSavingDate ? "저장 중..." : "일정변경 저장"}
                </button>
              )}

              {selectedItem.href && (
                <Link
                  href={selectedItem.href}
                  className="bg-blue-600 text-white px-4 py-2 rounded"
                >
                  상세보기
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}