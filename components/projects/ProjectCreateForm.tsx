"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { addActivity } from "@/lib/activity";
import {
  createProjectWithSections,
  getProjectCreationErrorMessage,
  getUniqueConstraintName,
} from "@/lib/project-creation";
import { getActiveProcessTypes } from "@/lib/process-types";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { getProjectEntryOptions } from "@/lib/project-master-data";
import { EditableCombobox } from "@/components/ui/EditableCombobox";
import type { ProcessTypeOption } from "@/types/process-type";
import type {
  CreateProjectWithSectionsInput,
  SectionFormState,
} from "@/types/project-section";

type ProjectFormState = {
  project_code: string;
  project_name: string;
  client_name: string;
  salesperson: string;
  site_address: string;
  assembly_vendor: string;
  task_manager: string;
  start_date: string;
  end_date: string;
  memo: string;
};

type ProjectCreateFormProps = {
  onCancel: () => void;
  onSuccess: (projectId: number) => void;
  onDirtyChange?: (isDirty: boolean) => void;
};

const initialProjectForm: ProjectFormState = {
  project_code: "",
  project_name: "",
  client_name: "",
  salesperson: "",
  site_address: "",
  assembly_vendor: "",
  task_manager: "",
  start_date: "",
  end_date: "",
  memo: "",
};

const inputClassName =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

function normalizeText(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

export function ProjectCreateForm({
  onCancel,
  onSuccess,
  onDirtyChange,
}: ProjectCreateFormProps) {
  const [projectForm, setProjectForm] =
    useState<ProjectFormState>(initialProjectForm);
  const [processTypes, setProcessTypes] = useState<ProcessTypeOption[]>([]);
  const [sections, setSections] = useState<SectionFormState[]>([]);
  const [templateProcessCodes, setTemplateProcessCodes] = useState<Set<string>>(
    () => new Set()
  );
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [salespersonOptions, setSalespersonOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [assemblyVendorOptions, setAssemblyVendorOptions] = useState<string[]>([]);

  const isDirty = useMemo(
    () =>
      sections.length > 0 ||
      Object.values(projectForm).some((value) => value.trim() !== ""),
    [projectForm, sections.length]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    let isMounted = true;

    async function loadProcesses() {
      setIsLoadingProcesses(true);
      const [processResult, templateResult, entryOptionResult] = await Promise.all([
        getActiveProcessTypes(),
        supabase.from("task_templates").select("process_type"),
        getProjectEntryOptions(),
      ]);

      if (!isMounted) return;

      if (processResult.error) {
        setErrorMessage(processResult.error.message);
        setProcessTypes([]);
      } else {
        setProcessTypes(processResult.data);
      }

      if (!templateResult.error) {
        setTemplateProcessCodes(
          new Set(
            (templateResult.data ?? [])
              .map((row) => row.process_type)
              .filter((code): code is string => Boolean(code))
          )
        );
      }

      if (entryOptionResult.error) {
        console.error("project entry options error:", entryOptionResult.error);
      }
      setSalespersonOptions(entryOptionResult.data.salespeople);
      setAssemblyVendorOptions(entryOptionResult.data.assemblyVendors);

      setIsLoadingProcesses(false);
    }

    void loadProcesses();
    return () => {
      isMounted = false;
    };
  }, []);

  function updateProjectField<K extends keyof ProjectFormState>(
    field: K,
    value: ProjectFormState[K]
  ) {
    setProjectForm((current) => ({ ...current, [field]: value }));
  }

  function toggleProcess(process: ProcessTypeOption) {
    setSections((current) => {
      const isSelected = current.some(
        (section) => section.process_type === process.code
      );

      if (isSelected) {
        return current.filter(
          (section) => section.process_type !== process.code
        );
      }

      return [
        ...current,
        {
          process_type: process.code,
          process_name: process.name,
          assembly_vendor: projectForm.assembly_vendor,
          task_manager: projectForm.task_manager,
          quantity: null,
          start_date: "",
          end_date: "",
          memo: "",
        },
      ];
    });
  }

  function updateSection(
    processType: string,
    patch: Partial<SectionFormState>
  ) {
    setSections((current) =>
      current.map((section) =>
        section.process_type === processType
          ? { ...section, ...patch }
          : section
      )
    );
  }

  const orderedSections = useMemo(() => {
    const processOrder = new Map(
      processTypes.map((process, index) => [process.code, index])
    );

    return [...sections].sort((left, right) => {
      const leftIndex = processOrder.get(left.process_type) ?? Number.MAX_VALUE;
      const rightIndex = processOrder.get(right.process_type) ?? Number.MAX_VALUE;
      return leftIndex - rightIndex;
    });
  }, [processTypes, sections]);

  function validate() {
    if (!projectForm.project_code.trim()) return "프로젝트 코드를 입력하세요.";
    if (!projectForm.project_name.trim()) return "프로젝트명을 입력하세요.";
    if (sections.length === 0) return "공정을 최소 1개 선택하세요.";

    if (
      projectForm.start_date &&
      projectForm.end_date &&
      projectForm.end_date < projectForm.start_date
    ) {
      return "프로젝트 종료일은 시작일보다 빠를 수 없습니다.";
    }

    if (new Set(sections.map((section) => section.process_type)).size !== sections.length) {
      return "동일한 공정을 중복 선택할 수 없습니다.";
    }

    for (const section of sections) {
      if (section.quantity !== null && section.quantity < 0) {
        return `${section.process_name} 공정의 수량은 0 이상이어야 합니다.`;
      }

      if (
        section.start_date &&
        section.end_date &&
        section.end_date < section.start_date
      ) {
        return `${section.process_name} 공정의 종료일은 시작일보다 빠를 수 없습니다.`;
      }
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const normalizedProcessTypes = sections.map((section) => section.process_type.trim());
    const validationError = validate() || (
      new Set(normalizedProcessTypes).size !== normalizedProcessTypes.length
        ? "같은 공정이 중복 선택되었습니다."
        : null
    );
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    const processByCode = new Map(
      processTypes.map((process) => [process.code, process])
    );
    const input: CreateProjectWithSectionsInput = {
      project: {
        project_code: projectForm.project_code.trim(),
        project_name: projectForm.project_name.trim(),
        client_name: normalizeText(projectForm.client_name),
        salesperson: normalizeText(projectForm.salesperson),
        site_address: normalizeText(projectForm.site_address),
        assembly_vendor: normalizeText(projectForm.assembly_vendor),
        task_manager: normalizeText(projectForm.task_manager),
        start_date: projectForm.start_date || null,
        end_date: projectForm.end_date || null,
        memo: normalizeText(projectForm.memo),
      },
      sections: orderedSections.map((section, index) => ({
        process_type: section.process_type,
        assembly_vendor: normalizeText(section.assembly_vendor),
        task_manager: normalizeText(section.task_manager),
        quantity: section.quantity,
        start_date: section.start_date || null,
        end_date: section.end_date || null,
        memo: normalizeText(section.memo),
        sort_order:
          processByCode.get(section.process_type)?.sort_order ?? index,
      })),
    };

    console.debug("[create_project_with_sections] sections payload", input.sections);

    try {
      const result = await createProjectWithSections(input);

      if (result.error || result.projectId === null) {
        if (result.error) {
          console.error("[create_project_with_sections] RPC error", {
            code: result.error.code,
            message: result.error.message,
            details: result.error.details,
            hint: result.error.hint,
            constraint: getUniqueConstraintName(result.error),
          });
          setErrorMessage(getProjectCreationErrorMessage(result.error));
        } else {
          setErrorMessage("프로젝트 생성 중 오류가 발생했습니다.");
        }
        return;
      }

      await addActivity({
        type: "project_create",
        targetType: "project",
        targetId: result.projectId,
        projectId: result.projectId,
        title: "프로젝트 생성",
        description: `${projectForm.project_code.trim()} - ${projectForm.project_name.trim()}`,
        metadata: { processTypes: input.sections.map((section) => section.process_type) },
      });

      toast.success("프로젝트와 공정별 업무가 생성되었습니다.");
      onDirtyChange?.(false);
      onSuccess(result.projectId);
    } catch (error) {
      console.error("[create_project_with_sections] unexpected error", error);
      setErrorMessage("프로젝트 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      <section>
        <h3 className="text-base font-bold text-slate-950">프로젝트 기본정보</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            프로젝트 코드 <span className="text-red-500">*</span>
            <input className={inputClassName} value={projectForm.project_code} onChange={(event) => updateProjectField("project_code", event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            프로젝트명 <span className="text-red-500">*</span>
            <input className={inputClassName} value={projectForm.project_name} onChange={(event) => updateProjectField("project_name", event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            발주처
            <input className={inputClassName} value={projectForm.client_name} onChange={(event) => updateProjectField("client_name", event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            영업자
            <EditableCombobox className={inputClassName} placeholder="영업자를 검색하거나 직접 입력" options={salespersonOptions} value={projectForm.salesperson} onChange={(value) => updateProjectField("salesperson", value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
            현장주소
            <input className={inputClassName} value={projectForm.site_address} onChange={(event) => updateProjectField("site_address", event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            기본 조립처
            <EditableCombobox className={inputClassName} placeholder="조립업체를 검색하거나 직접 입력" options={assemblyVendorOptions} value={projectForm.assembly_vendor} onChange={(value) => updateProjectField("assembly_vendor", value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            기본 담당자
            <input className={inputClassName} value={projectForm.task_manager} onChange={(event) => updateProjectField("task_manager", event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            프로젝트 시작일
            <input type="date" className={inputClassName} value={projectForm.start_date} onChange={(event) => updateProjectField("start_date", event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            프로젝트 종료일
            <input type="date" className={inputClassName} value={projectForm.end_date} onChange={(event) => updateProjectField("end_date", event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
            메모
            <textarea className={`${inputClassName} min-h-20 resize-y`} value={projectForm.memo} onChange={(event) => updateProjectField("memo", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="border-t border-slate-200 pt-5">
        <h3 className="text-base font-bold text-slate-950">공정 선택</h3>
        <p className="mt-1 text-xs text-slate-500">
          활성 공정만 표시합니다. 공정 선택 시 현재 기본 조립처와 담당자를 한 번만 복사합니다.
        </p>
        {isLoadingProcesses ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> 공정 목록을 불러오는 중입니다.
          </div>
        ) : processTypes.length === 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            등록 가능한 활성 공정이 없습니다.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {processTypes.map((process) => {
              const checked = sections.some((section) => section.process_type === process.code);
              return (
                <label key={process.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${checked ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleProcess(process)} className="h-4 w-4 rounded border-slate-300" />
                  {process.name}
                </label>
              );
            })}
          </div>
        )}
      </section>

      {orderedSections.map((section) => (
        <section key={section.process_type} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-base font-bold text-slate-950">{section.process_name}</h4>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">{section.process_type}</span>
          </div>
          <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 sm:grid-cols-2">
            <span>프로젝트 코드: {projectForm.project_code.trim() || "-"}</span>
            <span>프로젝트명: {projectForm.project_name.trim() || "-"}</span>
            <span>발주처: {projectForm.client_name.trim() || "-"}</span>
            <span>영업자: {projectForm.salesperson.trim() || "-"}</span>
            <span className="sm:col-span-2">현장주소: {projectForm.site_address.trim() || "-"}</span>
          </div>
          {!templateProcessCodes.has(section.process_type) && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              이 공정에는 등록된 업무 템플릿이 없어 Section만 생성됩니다.
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">조립처<input className={inputClassName} value={section.assembly_vendor} onChange={(event) => updateSection(section.process_type, { assembly_vendor: event.target.value })} /></label>
            <label className="text-sm font-semibold text-slate-700">담당자<input className={inputClassName} value={section.task_manager} onChange={(event) => updateSection(section.process_type, { task_manager: event.target.value })} /></label>
            <label className="text-sm font-semibold text-slate-700">수량<input type="number" min={0} className={inputClassName} value={section.quantity ?? ""} onChange={(event) => updateSection(section.process_type, { quantity: event.target.value === "" ? null : Number(event.target.value) })} /></label>
            <div />
            <label className="text-sm font-semibold text-slate-700">시작일<input type="date" className={inputClassName} value={section.start_date} onChange={(event) => updateSection(section.process_type, { start_date: event.target.value })} /></label>
            <label className="text-sm font-semibold text-slate-700">종료일<input type="date" className={inputClassName} value={section.end_date} onChange={(event) => updateSection(section.process_type, { end_date: event.target.value })} /></label>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">메모<textarea className={`${inputClassName} min-h-16 resize-y`} value={section.memo} onChange={(event) => updateSection(section.process_type, { memo: event.target.value })} /></label>
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white py-3">
        <button type="button" onClick={onCancel} disabled={isSubmitting} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">취소</button>
        <button type="submit" disabled={isSubmitting || isLoadingProcesses || processTypes.length === 0} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {isSubmitting && <Loader2 size={15} className="animate-spin" />}
          {isSubmitting ? "등록 중..." : "프로젝트 등록"}
        </button>
      </div>
    </form>
  );
}
