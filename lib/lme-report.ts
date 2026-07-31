import { buildLmeAnalysis } from "@/lib/lme-analysis";
import { formatNumber, LME_STATUS_PRESENTATION, type LmeRecord } from "@/lib/lme";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function buildChart(records: LmeRecord[]) {
  const data = records.filter((record) => record.is_current).sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  if (data.length === 0) return '<div class="empty">차트 데이터가 없습니다.</div>';
  const keys = ["domestic_lme_krw_per_kg", "standard_cost_krw_per_kg", "applied_price_krw_per_kg"] as const;
  const colors = ["#2563eb", "#f59e0b", "#059669"];
  const values = data.flatMap((record) => keys.map((key) => record[key]));
  const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
  const x = (index: number) => data.length === 1 ? 400 : 35 + index * 730 / (data.length - 1);
  const y = (value: number) => 145 - (value - min) / range * 115;
  return `<svg viewBox="0 0 800 175" aria-label="LME 원가 추세">${[0, 1, 2, 3].map((line) => `<line x1="35" x2="765" y1="${30 + line * 38}" y2="${30 + line * 38}" stroke="#e2e8f0"/>`).join("")}${keys.map((key, keyIndex) => { const points = data.map((record, index) => `${x(index)},${y(record[key])}`).join(" "); return `${data.length > 1 ? `<polyline points="${points}" fill="none" stroke="${colors[keyIndex]}" stroke-width="2"/>` : ""}${data.map((record, index) => `<circle cx="${x(index)}" cy="${y(record[key])}" r="3" fill="${colors[keyIndex]}"/>`).join("")}`; }).join("")}${data.map((record, index) => `<text x="${x(index)}" y="168" text-anchor="middle" font-size="8" fill="#64748b">${record.reference_date.slice(5)}</text>`).join("")}</svg>`;
}

export function buildLmeReportHtml(input: { records: LmeRecord[]; startDate: string; endDate: string }) {
  const current = input.records.filter((record) => record.is_current).sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  const latest = current.at(-1);
  const analysis = buildLmeAnalysis(input.records);
  const kpis = latest ? [
    ["최근 LME", `${formatNumber(latest.lme_al_usd_per_ton, 1)} USD/ton`], ["환율", `${formatNumber(latest.exchange_rate_krw_per_usd, 1)} KRW/USD`],
    ["국내 환산 LME", `${formatNumber(latest.domestic_lme_krw_per_kg)} 원/kg`], ["기준원가", `${formatNumber(latest.standard_cost_krw_per_kg)} 원/kg`],
    ["적용단가", `${formatNumber(latest.applied_price_krw_per_kg)} 원/kg`], ["차이율", `${formatNumber(latest.difference_rate, 2)}%`],
  ] : [];
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>LME 알루미늄 시세 보고서</title><style>
    @page { size: A4 landscape; margin: 9mm; } * { box-sizing: border-box; } body { margin: 0; color: #0f172a; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; font-size: 9px; }
    header { display:flex; justify-content:space-between; align-items:end; border-bottom:2px solid #1e3a8a; padding-bottom:7px; } .logo { width:92px; height:34px; border:1px dashed #94a3b8; display:flex; align-items:center; justify-content:center; color:#64748b; }
    h1 { margin:0; font-size:20px; } .sub { margin-top:3px; color:#64748b; } .kpis { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin:9px 0; } .kpi { border:1px solid #cbd5e1; border-radius:7px; padding:7px; } .kpi b { display:block; margin-top:3px; font-size:12px; }
    .body { display:grid; grid-template-columns:1.35fr .65fr; gap:9px; } section { border:1px solid #cbd5e1; border-radius:8px; padding:8px; } h2 { margin:0 0 5px; font-size:12px; } svg { width:100%; height:150px; } .legend { display:flex; gap:12px; justify-content:flex-end; color:#475569; }
    .legend i { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:3px; } .analysis li { margin:0 0 7px; line-height:1.45; } .contract { margin-top:8px; } table { width:100%; border-collapse:collapse; } th,td { border:1px solid #cbd5e1; padding:5px; text-align:left; } th { background:#f1f5f9; } .empty { height:150px; display:flex; align-items:center; justify-content:center; color:#64748b; }
    footer { margin-top:7px; display:flex; justify-content:space-between; color:#64748b; } @media print { body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
  </style></head><body><header><div><h1>LME 알루미늄 시세 비교 보고서</h1><div class="sub">조회기간 ${escapeHtml(input.startDate || "전체")} ~ ${escapeHtml(input.endDate || "전체")}</div></div><div class="logo">회사 로고</div></header>
  <div class="kpis">${kpis.map(([label, value]) => `<div class="kpi">${label}<b>${value}</b></div>`).join("") || '<div class="kpi">조회 데이터 없음</div>'}</div>
  <div class="body"><section><h2>원가 및 적용단가 추세</h2><div class="legend"><span><i style="background:#2563eb"></i>국내 LME</span><span><i style="background:#f59e0b"></i>기준원가</span><span><i style="background:#059669"></i>적용단가</span></div>${buildChart(input.records)}</section><div><section><h2>자동 분석 의견</h2><ul class="analysis">${analysis.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul></section>${latest ? `<section class="contract"><h2>최근 계약</h2><table><tr><th>기준일</th><td>${latest.reference_date}</td></tr><tr><th>공급업체</th><td>${escapeHtml(latest.supplier_name ?? "-")}</td></tr><tr><th>적용기간</th><td>${latest.effective_start_date ?? "-"} ~ ${latest.effective_end_date ?? "-"}</td></tr><tr><th>차액</th><td>${formatNumber(latest.difference_krw_per_kg)} 원/kg</td></tr><tr><th>상태</th><td>${LME_STATUS_PRESENTATION[latest.status].label}</td></tr></table></section>` : ""}</div></div>
  <footer><span>공무팀 ERP Statistics</span><span>출력일 ${new Date().toLocaleDateString("ko-KR")}</span></footer></body></html>`;
}

export function printLmeReport(input: { records: LmeRecord[]; startDate: string; endDate: string }) {
  const popup = window.open("", "_blank", "width=1200,height=850");
  if (!popup) throw new Error("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.");
  popup.opener = null;
  popup.document.open(); popup.document.write(buildLmeReportHtml(input)); popup.document.close(); popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

