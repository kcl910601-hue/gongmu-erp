export type EmployeeFormValue = {
  name: string;
  email: string;
  phone: string;
  organization_id: string;
  position: string;
  role: string;
  active: boolean;
  memo: string;
};

type OrganizationOption = { id: number; name: string };

export function EmployeeForm({ value, organizations, disabled, onChange }: {
  value: EmployeeFormValue;
  organizations: OrganizationOption[];
  disabled: boolean;
  onChange: (value: EmployeeFormValue) => void;
}) {
  const inputClass = "rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 disabled:bg-slate-100";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">이름 *<input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} disabled={disabled} className={`mt-1 w-full ${inputClass}`} /></label>
      <label className="text-sm font-medium text-slate-700">이메일<input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} disabled={disabled} className={`mt-1 w-full ${inputClass}`} /></label>
      <label className="text-sm font-medium text-slate-700">연락처<input inputMode="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} disabled={disabled} className={`mt-1 w-full ${inputClass}`} /></label>
      <label className="text-sm font-medium text-slate-700">조직 *<select value={value.organization_id} onChange={(e) => onChange({ ...value, organization_id: e.target.value })} disabled={disabled} className={`mt-1 w-full ${inputClass}`}><option value="">조직 선택</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-700">직급<input value={value.position} onChange={(e) => onChange({ ...value, position: e.target.value })} disabled={disabled} className={`mt-1 w-full ${inputClass}`} /></label>
      <label className="text-sm font-medium text-slate-700">권한<select value={value.role} onChange={(e) => onChange({ ...value, role: e.target.value })} disabled={disabled} className={`mt-1 w-full ${inputClass}`}><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option><option value="viewer">Viewer</option></select></label>
      <label className="text-sm font-medium text-slate-700">활성 여부<select value={value.active ? "active" : "inactive"} onChange={(e) => onChange({ ...value, active: e.target.value === "active" })} disabled={disabled} className={`mt-1 w-full ${inputClass}`}><option value="active">활성</option><option value="inactive">비활성</option></select></label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">메모<textarea value={value.memo} onChange={(e) => onChange({ ...value, memo: e.target.value })} disabled={disabled} className={`mt-1 min-h-24 w-full resize-y ${inputClass}`} /></label>
    </div>
  );
}
