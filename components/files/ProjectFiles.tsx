"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Trash2,
  Upload,
} from "lucide-react";
import { getCurrentEmployee, isAdmin, type CurrentEmployee } from "@/lib/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileUploadModal } from "@/components/files/FileUploadModal";
import {
  deleteProjectFile,
  formatFileSize,
  getFileExtension,
  getProjectFileSignedUrl,
  getProjectFileTypeLabel,
  isPreviewableFile,
  listProjectFiles,
  type ProjectFile,
} from "@/lib/files";

type ProjectFilesProps = {
  projectId: string | number;
};

export function ProjectFiles({ projectId }: ProjectFilesProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [currentEmployee, setCurrentEmployee] =
    useState<CurrentEmployee | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<number | string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canDelete = isAdmin(currentEmployee);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const projectFiles = await listProjectFiles(projectId);
      setFiles(projectFiles);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "파일 목록을 불러오지 못했습니다.";
      setErrorMessage(message);
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
    async function loadEmployee() {
      const employee = await getCurrentEmployee();
      setCurrentEmployee(employee);
    }

    void loadEmployee();
  }, []);

  async function handleOpenFile(file: ProjectFile) {
    setErrorMessage("");

    try {
      const signedUrl = await getProjectFileSignedUrl(file);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "파일을 열 수 없습니다.";
      setErrorMessage(message);
    }
  }

  async function handleDeleteFile(file: ProjectFile) {
    const confirmed = window.confirm("파일을 삭제하시겠습니까?");
    if (!confirmed || isDeletingId) return;

    setIsDeletingId(file.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteProjectFile(file);
      await loadFiles();
      setSuccessMessage("파일이 삭제되었습니다.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "파일 삭제에 실패했습니다.";
      setErrorMessage(message);
    } finally {
      setIsDeletingId(null);
    }
  }

  function handleUploaded() {
    setSuccessMessage("파일이 업로드되었습니다.");
    void loadFiles();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-500">
            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-950">
                프로젝트 파일
              </span>
              <Badge variant="default" className="px-2.5 py-0.5">
                등록 {files.length}개
              </Badge>
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              도면, 현장 사진, 계약서 등 현장 파일을 한곳에서 관리합니다.
            </span>
          </span>
        </button>

        <Button
          variant="primary"
          onClick={() => setIsUploadModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
        >
          <Upload size={16} />
          파일 업로드
        </Button>
      </div>

      {isOpen && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          {successMessage && (
            <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          {isLoading ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
              파일 목록을 불러오는 중입니다.
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              message="등록된 프로젝트 파일이 없습니다."
              className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] table-fixed text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-[32%] px-4 py-3 text-left">파일명</th>
                    <th className="w-[12%] px-4 py-3 text-left">분류</th>
                    <th className="w-[10%] px-4 py-3 text-left">확장자</th>
                    <th className="w-[10%] px-4 py-3 text-left">크기</th>
                    <th className="w-[14%] px-4 py-3 text-left">등록자</th>
                    <th className="w-[12%] px-4 py-3 text-left">등록일</th>
                    <th className="w-[10%] px-4 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {files.map((file) => (
                    <tr
                      key={file.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="rounded-xl bg-slate-100 p-2 text-slate-500">
                            <FileText size={16} />
                          </span>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => void handleOpenFile(file)}
                              className="block max-w-full truncate text-left font-semibold text-slate-950 transition-colors hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                              title={file.file_name}
                            >
                              {file.file_name}
                            </button>
                            {file.description && (
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {file.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="info" className="px-2.5 py-0.5">
                          {getProjectFileTypeLabel(file.file_type)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {getFileExtension(file.file_name)}
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
                            className="flex items-center gap-1 rounded-xl border-slate-200 px-2.5 py-1 text-xs"
                          >
                            <Download size={13} />
                            {isPreviewableFile(file) ? "열기" : "다운로드"}
                          </Button>
                          {canDelete && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => void handleDeleteFile(file)}
                              disabled={isDeletingId === file.id}
                              className="rounded-xl border-red-100 px-2.5 py-1 text-xs hover:bg-red-50"
                            >
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isUploadModalOpen && (
        <FileUploadModal
          projectId={projectId}
          uploaderName={currentEmployee?.name ?? null}
          uploaderEmail={currentEmployee?.email ?? null}
          onClose={() => setIsUploadModalOpen(false)}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
