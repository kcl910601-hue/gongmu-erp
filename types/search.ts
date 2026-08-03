export type ProjectSearchResult = {
  id: number;
  projectCode: string | null;
  projectName: string;
  processType: string;
  taskManager: string | null;
  status: string | null;
};

export type TaskSearchResult = {
  id: number;
  projectId: number;
  projectSectionId?: number | null;
  taskName: string | null;
  projectName: string;
  assignee: string | null;
  dueDate: string | null;
  status: string | null;
};

export type ShipmentSearchResult = {
  id: number;
  projectId: number | null;
  title: string;
  projectName: string | null;
  shipmentDate: string | null;
  status: string | null;
  assignee: string | null;
};

export type EmployeeSearchResult = {
  id: number;
  name: string;
  position: string | null;
  role: string | null;
  active: boolean | null;
};

export type MaterialContractSearchResult = { id: string; contractName: string; supplierName: string | null; materialCode: string; status: string };
export type PersonalSearchResult = { id: string; noteType: "todo" | "memo" | "sticky"; title: string; content: string };
export type LmeSearchResult = { code: string; name: string };

export type GlobalSearchResponse = {
  projects: ProjectSearchResult[];
  tasks: TaskSearchResult[];
  shipments: ShipmentSearchResult[];
  employees: EmployeeSearchResult[];
  materialContracts: MaterialContractSearchResult[];
  personal: PersonalSearchResult[];
  lme: LmeSearchResult[];
};
