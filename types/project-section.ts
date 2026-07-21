export type ProjectSectionStatus =
  | "pending"
  | "in_progress"
  | "hold"
  | "completed";

export type ProjectSection = {
  id: number;
  project_id: number;
  process_type: string;
  assembly_vendor: string | null;
  task_manager: string | null;
  quantity: number | null;
  start_date: string | null;
  end_date: string | null;
  status: ProjectSectionStatus;
  memo: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CreateProjectInput = {
  project_code: string;
  project_name: string;
  client_name: string | null;
  salesperson: string | null;
  site_address: string | null;
  assembly_vendor: string | null;
  task_manager: string | null;
  start_date: string | null;
  end_date: string | null;
  memo: string | null;
};

export type CreateSectionInput = {
  process_type: string;
  assembly_vendor: string | null;
  task_manager: string | null;
  quantity: number | null;
  start_date: string | null;
  end_date: string | null;
  memo: string | null;
  sort_order: number;
};

export type CreateProjectWithSectionsInput = {
  project: CreateProjectInput;
  sections: CreateSectionInput[];
};

export type SectionFormState = {
  process_type: string;
  process_name: string;
  assembly_vendor: string;
  task_manager: string;
  quantity: number | null;
  start_date: string;
  end_date: string;
  memo: string;
};

export type SectionProgress = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  delayed: number;
  percentage: number;
};

export type ProjectSectionDetail = ProjectSection & {
  process_name: string;
  process_color: string | null;
  process_sort_order: number;
  progress: SectionProgress;
};

export type CreateProjectSectionInput = {
  projectId: number;
  processType: string;
  assemblyVendor: string | null;
  taskManager: string | null;
  quantity: number | null;
  startDate: string | null;
  endDate: string | null;
  memo: string | null;
  sourceSectionId?: number | null;
};
