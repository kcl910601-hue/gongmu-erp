import { supabase } from "@/lib/supabase";
import type { CreateProjectWithSectionsInput } from "@/types/project-section";

type CreateProjectResult = {
  projectId: number | null;
  error: {
    message: string;
    details: string;
    hint: string;
    code: string;
  } | null;
};

export type ProjectCreationError = NonNullable<CreateProjectResult["error"]>;

export function getUniqueConstraintName(error: ProjectCreationError) {
  const source = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`;
  return source.match(/(?:constraint|index)\s+["']?([\w.-]+)["']?/i)?.[1] ?? null;
}

export function getProjectCreationErrorMessage(error: ProjectCreationError) {
  const constraint = getUniqueConstraintName(error);
  const source = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

  if (
    error.code === "23505" &&
    (source.includes("프로젝트 코드") || source.includes("project_code") || constraint?.includes("project_code"))
  ) {
    return "이미 사용 중인 프로젝트 코드입니다.";
  }

  if (
    error.code === "23505" &&
    (source.includes("공정") || source.includes("process_type") || constraint === "project_sections_project_process_uidx")
  ) {
    return "같은 공정이 중복 선택되었습니다.";
  }

  return "프로젝트 생성 중 오류가 발생했습니다.";
}

export async function createProjectWithSections(
  input: CreateProjectWithSectionsInput
): Promise<CreateProjectResult> {
  const { data, error } = await supabase.rpc("create_project_with_sections", {
    p_project: input.project,
    p_sections: input.sections,
  });

  if (error) {
    return { projectId: null, error };
  }

  const projectId = Number(data);

  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    return {
      projectId: null,
      error: {
        message: "프로젝트가 생성되었지만 반환된 ID를 확인할 수 없습니다.",
        details: "create_project_with_sections returned an invalid project id.",
        hint: "Check the RPC return type.",
        code: "INVALID_PROJECT_ID",
      },
    };
  }

  return { projectId, error: null };
}
