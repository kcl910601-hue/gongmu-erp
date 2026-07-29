export type ShipmentQuantityTask = {
  id: number;
  task_type: string | null;
  quantity: number | null;
};

export type ShipmentQuantitySummary = {
  projectQuantity: number | null;
  existingShipmentTotal: number;
  expectedShipmentTotal: number;
  remainingQuantity: number | null;
  maxInputQuantity: number | null;
  exceededQuantity: number;
  isExceeded: boolean;
  hasBlankShipmentTask: boolean;
  hasQuantityShipmentTask: boolean;
};

export function isShipmentQuantityTask(task: Pick<ShipmentQuantityTask, "task_type">) {
  return (task.task_type || "").includes("출고");
}

export function resolveShipmentQuantity(
  taskQuantity: number | null | undefined,
  projectQuantity: number | null | undefined
) {
  return taskQuantity ?? projectQuantity ?? null;
}

export function getShipmentQuantitySummary({
  projectQuantity,
  tasks,
  editingTaskId = null,
  inputQuantity = null,
}: {
  projectQuantity: number | null;
  tasks: ShipmentQuantityTask[];
  editingTaskId?: number | null;
  inputQuantity?: number | null;
}): ShipmentQuantitySummary {
  const shipmentTasks = tasks.filter(isShipmentQuantityTask);
  const existingShipmentTotal = shipmentTasks.reduce((total, task) => {
    if (task.id === editingTaskId || task.quantity === null || task.quantity <= 0) return total;
    return total + task.quantity;
  }, 0);
  const normalizedInput = inputQuantity !== null && Number.isFinite(inputQuantity) && inputQuantity > 0
    ? inputQuantity
    : 0;
  const expectedShipmentTotal = existingShipmentTotal + normalizedInput;
  const validProjectQuantity = projectQuantity !== null && projectQuantity > 0
    ? projectQuantity
    : null;
  const remainingQuantity = validProjectQuantity === null
    ? null
    : validProjectQuantity - expectedShipmentTotal;
  const maxInputQuantity = validProjectQuantity === null
    ? null
    : Math.max(0, validProjectQuantity - existingShipmentTotal);
  const exceededQuantity = validProjectQuantity === null
    ? 0
    : Math.max(0, expectedShipmentTotal - validProjectQuantity);

  return {
    projectQuantity: validProjectQuantity,
    existingShipmentTotal,
    expectedShipmentTotal,
    remainingQuantity,
    maxInputQuantity,
    exceededQuantity,
    isExceeded: exceededQuantity > 0,
    hasBlankShipmentTask: shipmentTasks.some((task) => task.quantity === null),
    hasQuantityShipmentTask: normalizedInput > 0
      || shipmentTasks.some((task) => task.quantity !== null && task.quantity > 0),
  };
}
