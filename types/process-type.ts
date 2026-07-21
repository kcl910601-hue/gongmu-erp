export type ProcessType = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProcessTypeOption = Pick<
  ProcessType,
  "id" | "code" | "name" | "sort_order" | "color"
>;
