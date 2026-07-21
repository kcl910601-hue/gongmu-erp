"use client";

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";
import { createAuditChanges, SHIPMENT_AUDIT_FIELDS } from "@/lib/audit";
import { recordRecentWorkspaceItem } from "@/lib/recent";
import { toast } from "@/lib/toast";
import { TableViewControls } from "@/components/ui/TableViewControls";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  paginateRows,
  sortRows,
  type SortDirection,
} from "@/lib/table-view";

type Shipment = {
  id: number;
  project_id: number | null;
  task_id?: number | null;
  site_name: string;
  item_name: string;
  quantity: number | null;
  shipment_date: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  destination: string | null;
  receiver: string | null;
  status: string | null;
  memo: string | null;
};

const statusList = ["출고대기", "출고완료", "취소"];
const filterList = ["전체", "오늘 예정", "출고대기", "출고완료", "취소"];

function getShipmentStatusFromQuery() {
  const searchParams = new URLSearchParams(window.location.search);
  const status = searchParams.get("status");
  const filter = searchParams.get("filter");

  if (filter === "today") return "오늘 예정";
  if (!status) return null;
  if (status === "pending") return "출고대기";
  if (status === "completed") return "출고완료";
  if (status === "canceled") return "취소";
  return "출고대기";
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [statusFilter, setStatusFilter] = usePersistentState(
    "erp:table:shipments:status",
    "출고대기"
  );
  const [searchQuery, setSearchQuery] = usePersistentState(
    "erp:table:shipments:search",
    ""
  );
  const [sortKey, setSortKey] = usePersistentState(
    "erp:table:shipments:sort-key",
    "shipment_date"
  );
  const [sortDirection, setSortDirection] =
    usePersistentState<SortDirection>(
      "erp:table:shipments:sort-direction",
      "desc"
    );
  const [pageSize, setPageSize] = usePersistentState(
    "erp:table:shipments:page-size",
    20
  );
  const [currentPage, setCurrentPage] = usePersistentState(
    "erp:table:shipments:page",
    1
  );
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    site_name: "",
    item_name: "",
    quantity: "",
    shipment_date: "",
    vehicle_number: "",
    driver_name: "",
    driver_phone: "",
    destination: "",
    receiver: "",
    memo: "",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const queryStatus = getShipmentStatusFromQuery();
      if (queryStatus) setStatusFilter(queryStatus);
      void loadShipments();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [setStatusFilter]);

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  async function loadShipments() {
    setIsLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase
      .from("shipments")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    setShipments(data || []);
    setIsLoading(false);
  }

  function resetForm() {
    setForm({
      site_name: "",
      item_name: "",
      quantity: "",
      shipment_date: "",
      vehicle_number: "",
      driver_name: "",
      driver_phone: "",
      destination: "",
      receiver: "",
      memo: "",
    });
  }

  function openAddModal() {
    resetForm();
    setEditingShipment(null);
    setShowModal(true);
  }

  function openEditModal(shipment: Shipment) {
    void recordRecentWorkspaceItem({
      key: `shipment-${shipment.id}`,
      type: "shipment",
      name: `출고 #${shipment.id} · ${shipment.item_name}`,
      href: "/shipments",
      project_id: shipment.project_id,
    });
    setEditingShipment(shipment);
    setForm({
      site_name: shipment.site_name || "",
      item_name: shipment.item_name || "",
      quantity: shipment.quantity ? String(shipment.quantity) : "",
      shipment_date: shipment.shipment_date || "",
      vehicle_number: shipment.vehicle_number || "",
      driver_name: shipment.driver_name || "",
      driver_phone: shipment.driver_phone || "",
      destination: shipment.destination || "",
      receiver: shipment.receiver || "",
      memo: shipment.memo || "",
    });
    setShowModal(true);
  }

  async function saveShipment() {
    if (isSaving) return;

    if (!form.site_name.trim() || !form.item_name.trim()) {
      toast.warning("현장명과 품목은 필수입니다.");
      return;
    }

    setIsSaving(true);

    const saveData = {
      site_name: form.site_name.trim(),
      item_name: form.item_name.trim(),
      quantity: form.quantity ? Number(form.quantity) : null,
      shipment_date: form.shipment_date || null,
      vehicle_number: form.vehicle_number.trim() || null,
      driver_name: form.driver_name.trim() || null,
      driver_phone: form.driver_phone.trim() || null,
      destination: form.destination.trim() || null,
      receiver: form.receiver.trim() || null,
      memo: form.memo.trim() || null,
    };

    if (editingShipment) {
      const changes = createAuditChanges(
        editingShipment as unknown as Record<string, unknown>,
        saveData,
        SHIPMENT_AUDIT_FIELDS
      );

      if (changes.length === 0) {
        setShowModal(false);
        setEditingShipment(null);
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from("shipments")
        .update(saveData)
        .eq("id", editingShipment.id);

      if (error) {
        toast.error(error.message);
        setIsSaving(false);
        return;
      }

      await logActivity({
        type: "shipment_update",
        title: `출고 수정 · ${changes.length}개 항목 변경`,
        description: `${saveData.site_name} ${saveData.item_name} 출고 정보를 수정했습니다.`,
        projectId: editingShipment.project_id,
        targetType: "shipment",
        targetId: editingShipment.id,
        metadata: { changes },
      });
    } else {
      const { data, error } = await supabase.from("shipments").insert([
        {
          ...saveData,
          project_id: null,
          task_id: null,
          status: "출고대기",
        },
      ]).select("id").single();

      if (error) {
        toast.error(error.message);
        setIsSaving(false);
        return;
      }

      await logActivity({
        type: "shipment_create",
        title: "출고 생성",
        description: `${saveData.site_name} ${saveData.item_name} 출고를 생성했습니다.`,
        projectId: null,
        targetType: "shipment",
        targetId: data.id,
      });
    }

    setShowModal(false);
    setEditingShipment(null);
    resetForm();
    setIsSaving(false);
    loadShipments();
  }

  async function updateShipmentStatus(id: number, status: string) {
    const targetShipment = shipments.find((shipment) => shipment.id === id);

    if (!targetShipment) {
      toast.warning("출고 정보를 찾을 수 없습니다.");
      return;
    }

    const nextShipmentDate =
      status === "출고완료"
        ? targetShipment.shipment_date || getToday()
        : targetShipment.shipment_date;
    const updatedShipment = {
      ...targetShipment,
      status,
      shipment_date: nextShipmentDate,
    };
    const changes = createAuditChanges(
      targetShipment as unknown as Record<string, unknown>,
      updatedShipment as unknown as Record<string, unknown>,
      SHIPMENT_AUDIT_FIELDS
    );

    if (changes.length === 0) return;

    const { error } = await supabase
      .from("shipments")
      .update({
        status,
        shipment_date: nextShipmentDate,
      })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setShipments((prev) =>
      prev.map((shipment) =>
        shipment.id === id
          ? {
              ...shipment,
              status,
              shipment_date: nextShipmentDate,
            }
          : shipment
      )
    );

    if (status === "출고완료") {
      await logActivity({
        type: "shipment_complete",
        title: `출고 완료 · ${changes.length}개 항목 변경`,
        description: `${targetShipment.site_name} ${targetShipment.item_name} 출고를 완료했습니다.`,
        projectId: targetShipment.project_id,
        targetType: "shipment",
        targetId: targetShipment.id,
        metadata: { changes },
      });
      setStatusFilter("출고완료");
    } else {
      await logActivity({
        type: "shipment_update",
        title: `출고 상태 변경 · ${changes.length}개 항목 변경`,
        description: `${targetShipment.item_name} 출고 상태를 ${status}(으)로 변경했습니다.`,
        projectId: targetShipment.project_id,
        targetType: "shipment",
        targetId: targetShipment.id,
        metadata: { changes },
      });
    }
  }

  function getStatusStyle(status: string | null) {
    if (status === "출고완료") {
      return "bg-green-100 text-green-700 border-green-300";
    }

    if (status === "취소") {
      return "bg-red-100 text-red-700 border-red-300";
    }

    return "bg-yellow-100 text-yellow-700 border-yellow-300";
  }

  const waitingCount = shipments.filter(
    (shipment) => shipment.status === "출고대기" || !shipment.status
  ).length;

  const completedCount = shipments.filter(
    (shipment) => shipment.status === "출고완료"
  ).length;

  const canceledCount = shipments.filter(
    (shipment) => shipment.status === "취소"
  ).length;

  const filteredShipments = shipments.filter((shipment) => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");
    const matchesSearch =
      !normalizedQuery ||
      [shipment.site_name, shipment.item_name, shipment.driver_name]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("ko-KR").includes(normalizedQuery)
        );
    const matchesStatus =
      statusFilter === "전체" ||
      (statusFilter === "오늘 예정"
        ? shipment.shipment_date === getToday()
        :
      (statusFilter === "출고대기"
        ? shipment.status === "출고대기" || !shipment.status
        : shipment.status === statusFilter));
    return matchesSearch && matchesStatus;
  });
  const sortedShipments = sortRows(
    filteredShipments,
    (shipment) => {
      if (sortKey === "site_name") return shipment.site_name;
      if (sortKey === "item_name") return shipment.item_name;
      if (sortKey === "status") return shipment.status;
      return shipment.shipment_date;
    },
    sortDirection
  );
  const shipmentPage = paginateRows(
    sortedShipments,
    currentPage,
    pageSize
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">출고 관리</h1>

        <button
          onClick={openAddModal}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          출고 등록
        </button>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-6">
        <button
          onClick={() => setStatusFilter("전체")}
          className="bg-white rounded-xl shadow p-5 text-left"
        >
          <h3 className="text-gray-600">전체 출고</h3>
          <p className="text-3xl font-bold">{shipments.length}</p>
        </button>

        <button
          onClick={() => setStatusFilter("출고대기")}
          className="bg-white rounded-xl shadow p-5 text-left"
        >
          <h3 className="text-gray-600">출고대기</h3>
          <p className="text-3xl font-bold text-yellow-600">{waitingCount}</p>
        </button>

        <button
          onClick={() => setStatusFilter("출고완료")}
          className="bg-white rounded-xl shadow p-5 text-left"
        >
          <h3 className="text-gray-600">출고완료</h3>
          <p className="text-3xl font-bold text-green-600">
            {completedCount}
          </p>
        </button>

        <button
          onClick={() => setStatusFilter("취소")}
          className="bg-white rounded-xl shadow p-5 text-left"
        >
          <h3 className="text-gray-600">취소</h3>
          <p className="text-3xl font-bold text-red-600">{canceledCount}</p>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-bold">조회 상태</div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border p-2 rounded"
          >
            {filterList.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="현장명, 품목, 기사명 검색"
            aria-label="출고 검색"
            className="min-w-64 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-xl font-bold mb-4">{statusFilter} 출고 내역</h2>
        {errorMessage ? (
          <ErrorState
            message={errorMessage}
            onRetry={() => void loadShipments()}
          />
        ) : isLoading ? (
          <TableSkeleton rows={7} columns={8} />
        ) : (
        <>
        <TableViewControls
          sortKey={sortKey}
          sortDirection={sortDirection}
          sortOptions={[
            { value: "shipment_date", label: "출고일" },
            { value: "site_name", label: "현장명" },
            { value: "item_name", label: "품목" },
            { value: "status", label: "상태" },
          ]}
          pageSize={pageSize}
          page={shipmentPage.page}
          totalPages={shipmentPage.totalPages}
          totalItems={filteredShipments.length}
          onSortKeyChange={(value) => {
            setSortKey(value);
            setCurrentPage(1);
          }}
          onSortDirectionChange={(value) => {
            setSortDirection(value);
            setCurrentPage(1);
          }}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setCurrentPage(1);
          }}
          onPageChange={setCurrentPage}
        />

        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">현장명</th>
              <th className="text-left p-2">품목</th>
              <th className="text-left p-2">수량</th>
              <th className="text-left p-2">출고일</th>
              <th className="text-left p-2">차량번호</th>
              <th className="text-left p-2">기사명</th>
              <th className="text-left p-2">연락처</th>
              <th className="text-left p-2">도착지</th>
              <th className="text-left p-2">인수자</th>
              <th className="text-left p-2">상태</th>
              <th className="text-left p-2">관리</th>
            </tr>
          </thead>

          <tbody>
            {shipmentPage.rows.map((shipment) => (
              <tr key={shipment.id} className="border-b">
                <td className="p-2">{shipment.site_name}</td>
                <td className="p-2">{shipment.item_name}</td>
                <td className="p-2">{shipment.quantity ?? "-"}</td>
                <td className="p-2">{shipment.shipment_date || "-"}</td>
                <td className="p-2">{shipment.vehicle_number || "-"}</td>
                <td className="p-2">{shipment.driver_name || "-"}</td>
                <td className="p-2">{shipment.driver_phone || "-"}</td>
                <td className="p-2">{shipment.destination || "-"}</td>
                <td className="p-2">{shipment.receiver || "-"}</td>

                <td className="p-2">
                  <select
                    value={shipment.status || "출고대기"}
                    onChange={(e) =>
                      updateShipmentStatus(shipment.id, e.target.value)
                    }
                    className={`border px-2 py-1 rounded ${getStatusStyle(
                      shipment.status
                    )}`}
                  >
                    {statusList.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="p-2">
                  <button
                    onClick={() => openEditModal(shipment)}
                    className="border px-3 py-1 rounded"
                  >
                    수정
                  </button>
                </td>
              </tr>
            ))}

            {filteredShipments.length === 0 && (
              <tr>
                <td colSpan={11} className="p-0">
                  <EmptyState
                    title="조건에 맞는 출고가 없습니다."
                    message="필터를 변경하거나 새 출고를 등록해 보세요."
                    icon={<Truck size={26} />}
                    action={
                      <Button size="sm" variant="primary" onClick={openAddModal}>
                        출고 등록
                      </Button>
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg p-6 w-[620px]">
            <h2 className="text-2xl font-bold mb-5">
              {editingShipment ? "출고 정보 수정" : "출고 등록"}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <input
                className="border p-2 rounded"
                placeholder="현장명"
                value={form.site_name}
                onChange={(e) =>
                  setForm({ ...form, site_name: e.target.value })
                }
              />

              <input
                className="border p-2 rounded"
                placeholder="품목"
                value={form.item_name}
                onChange={(e) =>
                  setForm({ ...form, item_name: e.target.value })
                }
              />

              <input
                type="number"
                className="border p-2 rounded"
                placeholder="수량"
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: e.target.value })
                }
              />

              <input
                type="date"
                className="border p-2 rounded"
                value={form.shipment_date}
                onChange={(e) =>
                  setForm({ ...form, shipment_date: e.target.value })
                }
              />

              <input
                className="border p-2 rounded"
                placeholder="차량번호"
                value={form.vehicle_number}
                onChange={(e) =>
                  setForm({ ...form, vehicle_number: e.target.value })
                }
              />

              <input
                className="border p-2 rounded"
                placeholder="기사명"
                value={form.driver_name}
                onChange={(e) =>
                  setForm({ ...form, driver_name: e.target.value })
                }
              />

              <input
                className="border p-2 rounded"
                placeholder="연락처"
                value={form.driver_phone}
                onChange={(e) =>
                  setForm({ ...form, driver_phone: e.target.value })
                }
              />

              <input
                className="border p-2 rounded"
                placeholder="도착지"
                value={form.destination}
                onChange={(e) =>
                  setForm({ ...form, destination: e.target.value })
                }
              />

              <input
                className="border p-2 rounded"
                placeholder="인수자"
                value={form.receiver}
                onChange={(e) =>
                  setForm({ ...form, receiver: e.target.value })
                }
              />

              <input
                className="border p-2 rounded"
                placeholder="비고"
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingShipment(null);
                  resetForm();
                }}
                className="border px-4 py-2 rounded"
                disabled={isSaving}
              >
                취소
              </button>

              <button
                onClick={saveShipment}
                disabled={isSaving}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
