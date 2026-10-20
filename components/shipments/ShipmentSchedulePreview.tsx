import { renderShipmentScheduleDocument, shipmentScheduleStyles, type ShipmentScheduleDocument } from "@/lib/shipment-schedule-pdf";

type Props = ShipmentScheduleDocument & {
  onAdd?: (date: string) => void;
  onEdit?: (id: number) => void;
};

export function ShipmentSchedulePreview({ onAdd, onEdit, ...document }: Props) {
  return <div className="mx-auto w-max bg-white p-8 shadow-sm" onClick={(event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    if (button?.dataset.add) onAdd?.(button.dataset.add);
    if (button?.dataset.edit) onEdit?.(Number(button.dataset.edit));
  }}>
    <style>{shipmentScheduleStyles(document.options)}</style>
    <div style={{ width: document.options.paperSize === "A3" ? "402mm" : "279mm" }} dangerouslySetInnerHTML={{ __html: renderShipmentScheduleDocument(document, Boolean(onAdd || onEdit)) }} />
  </div>;
}
