"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Search, Trash2, Upload } from "lucide-react";
import { getCurrentEmployee, isAdmin, type CurrentEmployee } from "@/lib/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { TableViewControls } from "@/components/ui/TableViewControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FileUploadModal } from "@/components/files/FileUploadModal";
import {
  deleteProjectFile,
  formatFileSize,
  getFileExtension,
  getProjectFileCategory,
  getProjectFileSignedUrl,
  isPreviewableFile,
  listProjectFiles,
  type ProjectFile,
} from "@/lib/files";
import { recordRecentWorkspaceItem } from "@/lib/recent";
import { toast } from "@/lib/toast";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  paginateRows,
  sortRows,
  type SortDirection,
} from "@/lib/table-view";

type ProjectFilesProps = {
  projectId: string | number;
};

export function ProjectFiles({ projectId }: ProjectFilesProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [currentEmployee, setCurrentEmployee] =
    useState<CurrentEmployee | null>(null);
  const [searchQuery, setSearchQuery] = usePersistentState(
    `erp:table:files:${projectId}:search`,
    ""
  );
  const [sortKey, setSortKey] = usePersistentState(
    `erp:table:files:${projectId}:sort-key`,
    "uploaded_at"
  );
  const [sortDirection, setSortDirection] =
    usePersistentState<SortDirection>(
      `erp:table:files:${projectId}:sort-direction`,
      "desc"
    );
  const [pageSize, setPageSize] = usePersistentState(
    `erp:table:files:${projectId}:page-size`,
    20
  );
  const [currentPage, setCurrentPage] = usePersistentState(
    `erp:table:files:${projectId}:page`,
    1
  );
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<number | string | null>(null);
  const [filePendingDelete, setFilePendingDelete] =
    useState<ProjectFile | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const filteredFiles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");
    if (!normalizedQuery) return files;

    return files.filter((file) =>
      [
        file.file_name,
        getFileExtension(file.file_name),
        file.uploaded_by,
        file.uploaded_by_email,
      ].some((value) =>
        (value || "").toLocaleLowerCase("ko-KR").includes(normalizedQuery)
      )
    );
  }, [files, searchQuery]);
  const sortedFiles = sortRows(
    filteredFiles,
    (file) => {
      if (sortKey === "file_name") return file.file_name;
      if (sortKey === "size") return file.file_size;
      if (sortKey === "uploader") return file.uploaded_by;
      return file.created_at;
    },
    sortDirection
  );
  const filePage = paginateRows(sortedFiles, currentPage, pageSize);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      setFiles(await listProjectFiles(projectId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "파일 목록을 불러오지 못했습니다."
      );
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFiles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadFiles]);

  useEffect(() => {
    void getCurrentEmployee().then(setCurrentEmployee);
  }, []);

  function canDelete(file: ProjectFile) {
    if (isAdmin(currentEmployee)) return true;

    const currentEmail = currentEmployee?.email?.trim().toLowerCase();
    const uploaderEmail = file.uploaded_by_email?.trim().toLowerCase();
    return Boolean(currentEmail && uploaderEmail && currentEmail === uploaderEmail);
  }

  async function handleOpenFile(file: ProjectFile) {
    setErrorMessage("");

    try {
      await recordRecentWorkspaceItem({
        key: `file-${file.id}`,
        type: "file",
        name: file.file_name,
        href: `/projects/${file.project_id}#project-files`,
        project_id: Number(file.project_id),
      });
      const signedUrl = await getProjectFileSignedUrl(file);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "파일을 열 수 없습니다."
      );
    }
  }

  async function handleDeleteFile(file: ProjectFile) {
    if (isDeletingId) return;

    setIsDeletingId(file.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteProjectFile(file);
      await loadFiles();
      setSuccessMessage("파일이 삭제되었습니다.");
      toast.success("파일이 삭제되었습니다.");
      setFilePendingDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "파일 삭제에 실패했습니다."
      );
      setErrorMessage(
        error instanceof Error ? error.message : "파일 삭제에 실패했습니다."
      );
    } finally {
      setIsDeletingId(null);
    }
  }

  function handleUploaded() {
    setSuccessMessage("파일이 업로드되었습니다.");
    toast.success("파일이 업로드되었습니다.");
    void loadFiles();
  }

  return (
    <section
      id="project-files"
      className="mb-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              파일
            </h2>
            <Badge variant="default" className="px-2.5 py-0.5">
              {files.length}개
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            프로젝트 문서, 도면, 사진과 압축파일을 관리합니다.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <label className="relative block min-w-0 sm:w-72">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="파일명, 확장자, 업로드자 검색"
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
            />
          </label>
          <Button
            variant="primary"
            onClick={() => setIsUploadModalOpen(true)}
            className="flex h-10 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium"
          >
            <Upload size={16} />
            파일 업로드
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mt-4">
          <ErrorState message={errorMessage} onRetry={() => void loadFiles()} />
        </div>
      )}

      <div className="mt-5">
        {isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : filteredFiles.length === 0 ? (
          <EmptyState
            title={
              searchQuery ? "검색 결과가 없습니다." : "등록된 파일이 없습니다."
            }
            message={
              searchQuery
                ? "다른 파일명이나 확장자로 검색해 보세요."
                : "프로젝트 자료를 업로드해 한 곳에서 관리하세요."
            }
            icon={<FileText size={26} />}
            action={
              !searchQuery ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setIsUploadModalOpen(true)}
                >
                  파일 업로드
                </Button>
              ) : undefined
            }
            className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
          />
        ) : (
          <>
          <TableViewControls
            sortKey={sortKey}
            sortDirection={sortDirection}
            sortOptions={[
              { value: "uploaded_at", label: "업로드 날짜" },
              { value: "file_name", label: "파일명" },
              { value: "size", label: "용량" },
              { value: "uploader", label: "업로드자" },
            ]}
            pageSize={pageSize}
            page={filePage.page}
            totalPages={filePage.totalPages}
            totalItems={filteredFiles.length}
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] table-fixed text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="w-[38%] px-4 py-3 text-left">파일명</th>
                  <th className="w-[12%] px-4 py-3 text-left">분류</th>
                  <th className="w-[10%] px-4 py-3 text-left">용량</th>
                  <th className="w-[16%] px-4 py-3 text-left">업로드자</th>
                  <th className="w-[14%] px-4 py-3 text-left">업로드 날짜</th>
                  <th className="w-[10%] px-4 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filePage.rows.map((file) => {
                  const category = getProjectFileCategory(file);

                  return (
                    <tr
                      key={file.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-base">
                            {category.icon}
                          </span>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => void handleOpenFile(file)}
                              className="block max-w-full truncate text-left font-semibold text-slate-950 hover:text-blue-600"
                              title={file.file_name}
                            >
                              {file.file_name}
                            </button>
                            {file.description && (
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {file.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="info" className="px-2.5 py-0.5">
                          {category.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatFileSize(file.file_size)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="block truncate">
                          {file.uploaded_by || file.uploaded_by_email || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(file.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleOpenFile(file)}
                            className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs"
                          >
                            <Download size={13} />
                            {isPreviewableFile(file) ? "미리보기" : "다운로드"}
                          </Button>
                          {canDelete(file) && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setFilePendingDelete(file)}
                              disabled={isDeletingId === file.id}
                              className="rounded-xl px-2.5 py-1 text-xs"
                              aria-label={`${file.file_name} 삭제`}
                            >
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {isUploadModalOpen && (
        <FileUploadModal
          projectId={projectId}
          uploaderName={currentEmployee?.name ?? null}
          uploaderEmail={currentEmployee?.email ?? null}
          onClose={() => setIsUploadModalOpen(false)}
          onUploaded={handleUploaded}
        />
      )}
      <ConfirmDialog
        open={filePendingDelete !== null}
        title="파일 삭제"
        description={`${filePendingDelete?.file_name || "선택한 파일"}을 삭제하시겠습니까? 삭제한 파일은 복구할 수 없습니다.`}
        confirmLabel="삭제"
        danger
        isPending={isDeletingId !== null}
        onClose={() => setFilePendingDelete(null)}
        onConfirm={() => {
          if (filePendingDelete) void handleDeleteFile(filePendingDelete);
        }}
      />
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
