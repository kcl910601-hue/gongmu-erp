"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  PROJECT_FILE_TYPES,
  type ProjectFileType,
  uploadProjectFile,
} from "@/lib/files";

type FileUploadModalProps = {
  projectId: string | number;
  uploaderName: string | null;
  uploaderEmail: string | null;
  onClose: () => void;
  onUploaded: () => void;
};

const acceptedFileTypes = [
  "application/pdf",
  "image/*",
  ".xls",
  ".xlsx",
  ".doc",
  ".docx",
  ".hwp",
  ".hwpx",
  ".dwg",
  ".dxf",
].join(",");

export function FileUploadModal({
  projectId,
  uploaderName,
  uploaderEmail,
  onClose,
  onUploaded,
}: FileUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<ProjectFileType>("drawing");
  const [description, setDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleUpload() {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setErrorMessage("");

    try {
      await uploadProjectFile({
        projectId,
        file: selectedFile,
        fileType,
        description,
        uploaderName,
        uploaderEmail,
      });

      onUploaded();
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "파일 업로드 중 오류가 발생했습니다.";
      setErrorMessage(message);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950">
              파일 업로드
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              현재 프로젝트에 연결할 파일을 등록합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              파일 선택
            </span>
            <input
              type="file"
              accept={acceptedFileTypes}
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
              className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              파일 분류
            </span>
            <select
              value={fileType}
              onChange={(event) =>
                setFileType(event.target.value as ProjectFileType)
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {PROJECT_FILE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              설명 또는 메모
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="파일에 대한 간단한 메모를 입력하세요."
            />
          </label>

          {errorMessage && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isUploading}
            className="rounded-2xl px-4 py-2 text-sm"
          >
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="rounded-2xl px-4 py-2 text-sm"
          >
            {isUploading ? "업로드 중..." : "업로드"}
          </Button>
        </div>
      </div>
    </div>
  );
}
