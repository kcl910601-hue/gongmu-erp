import { formatNumber, type LmeRecord } from "@/lib/lme";

export function buildLmeAnalysis(records: LmeRecord[]) {
  const currentRecords = records.filter((record) => record.is_current).sort((a, b) => a.reference_date.localeCompare(b.reference_date) || a.created_at.localeCompare(b.created_at));
  const latest = currentRecords.at(-1);
  const previous = currentRecords.at(-2);
  if (!latest) return ["조회 기간에 분석할 LME 자료가 없습니다."];
  const messages: string[] = [];
  if (previous && previous.lme_al_usd_per_ton !== 0) {
    const changeRate = (latest.lme_al_usd_per_ton - previous.lme_al_usd_per_ton) / previous.lme_al_usd_per_ton * 100;
    messages.push(`LME 시세가 직전 계약 대비 ${Math.abs(changeRate).toFixed(1)}% ${changeRate >= 0 ? "상승" : "하락"}했습니다.`);
  }
  messages.push(`현재 적용단가는 기준원가보다 ${Math.abs(Math.round(latest.difference_krw_per_kg)).toLocaleString("ko-KR")}원 ${latest.difference_krw_per_kg >= 0 ? "높습니다" : "낮습니다"}.`);
  if (latest.status === "caution" || latest.status === "high") messages.push("다음 견적 산정 시 원자재 및 계약 단가 검토를 권장합니다.");
  if (previous && latest.lme_al_usd_per_ton < previous.lme_al_usd_per_ton) messages.push("LME 하락으로 원가 절감 가능성이 있습니다.");
  if (latest.status === "favorable") messages.push(`기준원가 대비 ${formatNumber(Math.abs(latest.difference_rate), 2)}% 유리한 단가가 적용되고 있습니다.`);
  return messages;
}

