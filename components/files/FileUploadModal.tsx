"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  inferProjectFileType,
  isAllowedProjectFile,
  uploadProjectFile,
} from "@/lib/files";

type FileUploadModalProps = {
  projectId: string | number;
  uploaderName: string | null;
  uploaderEmail: string | null;
  onClose: () => void;
  onUploaded: () => void;
};

const acceptedFileTypes = ".pdf,.xlsx,.docx,.dwg,.jpg,.jpeg,.png,.zip";

export function FileUploadModal({
  projectId,
  uploaderName,
  uploaderEmail,
  onClose,
  onUploaded,
}: FileUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isUploading) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isUploading, onClose]);

  function selectFile(file: File | null) {
    setErrorMessage("");

    if (file && !isAllowedProjectFile(file.name)) {
      setSelectedFile(null);
      setErrorMessage(
        "PDF, XLSX, DOCX, DWG, JPG, PNG, ZIP 파일만 업로드할 수 있습니다."
      );
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setErrorMessage("");

    try {
      await uploadProjectFile({
        projectId,
        file: selectedFile,
        fileType: inferProjectFileType(selectedFile.name),
        description,
        uploaderName,
        uploaderEmail,
      });

      onUploaded();
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "파일 업로드 중 오류가 발생했습니다."
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!isUploading) onClose();
      }}
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
              파일 형식에 따라 문서, 도면, 사진, 압축파일로 자동 분류됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            selectFile(event.dataTransfer.files[0] ?? null);
          }}
          className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            isDragging
              ? "border-blue-400 bg-blue-50"
              : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50"
          }`}
        >
          <FileUp size={28} className="text-blue-600" />
          <span className="mt-3 text-sm font-semibold text-slate-800">
            {selectedFile?.name || "파일을 선택하거나 여기에 끌어 놓으세요"}
          </span>
          <span className="mt-1 text-xs text-slate-500">
            PDF · XLSX · DOCX · DWG · JPG · PNG · ZIP
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFileTypes}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          className="sr-only"
        />

        <label className="mt-4 block">
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
          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

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
