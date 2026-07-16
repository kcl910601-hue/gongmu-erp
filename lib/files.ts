import { supabase } from "@/lib/supabase";

export const PROJECT_FILE_BUCKET = "project-files";

export const PROJECT_FILE_TYPES = [
  { value: "drawing", label: "도면" },
  { value: "site_photo", label: "현장 사진" },
  { value: "contract", label: "계약서" },
  { value: "estimate", label: "견적서" },
  { value: "completion_document", label: "준공서류" },
  { value: "other", label: "기타" },
] as const;

export type ProjectFileType = (typeof PROJECT_FILE_TYPES)[number]["value"];

export type ProjectFile = {
  id: number | string;
  project_id: number | string;
  file_name: string;
  file_type: ProjectFileType | string | null;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_by_email: string | null;
  created_at: string | null;
};

type UploadProjectFileInput = {
  projectId: string | number;
  file: File;
  fileType: ProjectFileType;
  description: string;
  uploaderName: string | null;
  uploaderEmail: string | null;
};

export function getProjectFileTypeLabel(fileType: string | null) {
  return (
    PROJECT_FILE_TYPES.find((type) => type.value === fileType)?.label || "기타"
  );
}

export function formatFileSize(size: number | null) {
  if (!size || size <= 0) return "-";

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();

  return extension && extension !== fileName ? extension.toUpperCase() : "-";
}

export function isPreviewableFile(file: ProjectFile) {
  const mimeType = file.mime_type || "";
  const extension = getFileExtension(file.file_name).toLowerCase();

  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    extension === "pdf"
  );
}

export async function listProjectFiles(projectId: string | number) {
  const { data, error } = await supabase
    .from("project_files")
    .select(
      "id, project_id, file_name, file_type, storage_path, file_size, mime_type, description, uploaded_by, uploaded_by_email, created_at"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProjectFile[];
}

export async function uploadProjectFile({
  projectId,
  file,
  fileType,
  description,
  uploaderName,
  uploaderEmail,
}: UploadProjectFileInput) {
  const storagePath = buildProjectFilePath(projectId, file.name);

  const { error: uploadError } = await supabase.storage
    .from(PROJECT_FILE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data, error: insertError } = await supabase
    .from("project_files")
    .insert([
      {
        project_id: projectId,
        file_name: file.name,
        file_type: fileType,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || null,
        description: description.trim() || null,
        uploaded_by: uploaderName,
        uploaded_by_email: uploaderEmail,
      },
    ])
    .select(
      "id, project_id, file_name, file_type, storage_path, file_size, mime_type, description, uploaded_by, uploaded_by_email, created_at"
    )
    .single();

  if (insertError) {
    await supabase.storage.from(PROJECT_FILE_BUCKET).remove([storagePath]);
    throw new Error(insertError.message);
  }

  return data as ProjectFile;
}

export async function getProjectFileSignedUrl(file: ProjectFile) {
  const { data, error } = await supabase.storage
    .from(PROJECT_FILE_BUCKET)
    .createSignedUrl(file.storage_path, 60 * 10, {
      download: !isPreviewableFile(file),
    });

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

export async function deleteProjectFile(file: ProjectFile) {
  const { error: storageError } = await supabase.storage
    .from(PROJECT_FILE_BUCKET)
    .remove([file.storage_path]);

  if (storageError) {
    throw new Error(storageError.message);
  }

  const { error: deleteError } = await supabase
    .from("project_files")
    .delete()
    .eq("id", file.id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

function buildProjectFilePath(projectId: string | number, fileName: string) {
  const safeFileName = fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const fallbackName = safeFileName || "file";
  const uniqueId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `projects/${projectId}/${uniqueId}-${fallbackName}`;
}
