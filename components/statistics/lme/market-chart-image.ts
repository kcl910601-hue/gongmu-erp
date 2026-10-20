import { getMarketComparisonRows, getMarketComparisonChangeRows, type MarketComparisonDraft } from "@/lib/lme-market-comparison";

// Render the existing chart content so exported values and plots match the screen.
export async function createMarketChartImage(root: HTMLDivElement, sources: string[], comparison?: MarketComparisonDraft): Promise<Blob> {
  const sections = Array.from(root.querySelectorAll("section")).map((section) => ({
    title: section.querySelector("h2")?.textContent ?? "",
    subtitle: section.querySelector("p")?.textContent ?? "",
    stats: Array.from(section.querySelectorAll("dl > div")).map((stat) => ({
      label: stat.querySelector("dt")?.textContent ?? "",
      value: stat.querySelector("dd")?.textContent ?? "",
      date: stat.querySelector("p")?.textContent ?? "",
    })),
    svg: section.querySelector("svg")?.cloneNode(true) as SVGSVGElement | undefined,
  }));
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 생성할 수 없습니다.");
  const width = 1680;
  const font = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  context.font = `12px ${font}`;
  const lines: string[] = [];
  for (const source of sources) {
    let line = "";
    for (const character of source) {
      if (context.measureText(line + character).width > width - 40) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
    lines.push(line);
  }
  const memoLines: string[] = [];
  context.font = `14px ${font}`;
  if (comparison?.memo) {
    for (const paragraph of comparison.memo.split("\n")) {
      let line = "";
      for (const character of paragraph) {
        if (context.measureText(line + character).width > width - 64) { memoLines.push(line); line = ""; }
        line += character;
      }
      memoLines.push(line);
    }
  }
  const showSavings = comparison?.showSavings !== false;
  const savingsHeight = showSavings ? 176 : 0;
  const memoTop = 716 + savingsHeight;
  const tableHeight = comparison ? 306 + savingsHeight + (memoLines.length ? 32 + memoLines.length * 22 : 0) : 0;
  const height = 410 + tableHeight + lines.length * 20 + 16;
  canvas.width = width * 2;
  canvas.height = height * 2;
  context.scale(2, 2);
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, width, height);
  const text = (value: string, x: number, y: number, size = 12, bold = false, color = "#64748b", maxWidth = 508) => {
    context.font = `${bold ? "600 " : ""}${size}px ${font}`;
    context.fillStyle = color;
    context.fillText(value, x, y, maxWidth);
  };
  for (const [index, section] of sections.entries()) {
    const left = 20 + index * 552;
    context.beginPath();
    context.roundRect(left, 18, 540, 374, 16);
    context.fillStyle = "#ffffff";
    context.fill();
    context.strokeStyle = "#e2e8f0";
    context.stroke();
    text(section.title, left + 16, 49, 14, true, "#0f172a");
    text(section.subtitle, left + 16, 71);
    section.stats.forEach((stat, statIndex) => {
      const x = left + 16 + statIndex * 129;
      context.beginPath();
      context.roundRect(x, 88, 121, 72, 8);
      context.fillStyle = "#f8fafc";
      context.fill();
      text(stat.label, x + 8, 106);
      text(stat.value, x + 8, 130, 14, true, "#0f172a", 105);
      text(stat.date, x + 8, 150, 10);
    });
    if (section.svg) {
      section.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      section.svg.setAttribute("width", "520");
      section.svg.setAttribute("height", "210");
      section.svg.setAttribute("font-family", font);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(section.svg)], { type: "image/svg+xml;charset=utf-8" }));
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("차트 이미지를 생성하지 못했습니다."));
          image.src = url;
        });
        context.drawImage(image, left + 10, 174, 520, 210);
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      text("데이터 없음", left + 235, 275, 14);
    }
  }
  if (comparison) {
    text("계약 단가 비교표 · 단위: 원/kg", 20, 422, 16, true, "#0f172a");
    const columns = [160, 360, 280, 280, 280, 280];
    const rowHeight = 44;
    const cell = (value: string, x: number, y: number, cellWidth: number, header = false) => {
      const after = x >= 1100;
      const before = x >= 540 && !after;
      context.fillStyle = after ? (header ? "#dbeafe" : "#eff6ff") : before ? (header ? "#e2e8f0" : "#f8fafc") : header ? "#f1f5f9" : "#ffffff";
      context.fillRect(x, y, cellWidth, rowHeight);
      context.strokeStyle = "#cbd5e1";
      context.strokeRect(x, y, cellWidth, rowHeight);
      const label = x < 540;
      const total = x === 820 || x === 1380;
      context.textAlign = header || label ? "center" : "right";
      text(value, header || label ? x + cellWidth / 2 : x + cellWidth - 16, y + 28, header ? 16 : 15, header || label || total || after, after ? (header ? "#0f172a" : "#020617") : "#0f172a", cellWidth - 32);
      context.textAlign = "left";
    };
    cell(`작성일: ${comparison.writtenDate}`, 20, 436, 520, true);
    cell(comparison.beforeLabel, 540, 436, 560, true);
    cell(comparison.afterLabel, 1100, 436, 560, true);
    const rows = [
      ["업체", "항목", "단가", "후처리 포함", "단가", "후처리 포함"],
      ...getMarketComparisonRows(comparison),
    ];
    rows.forEach((row, rowIndex) => {
      let x = 20;
      row.forEach((value, columnIndex) => {
        cell(value, x, 436 + (rowIndex + 1) * rowHeight, columns[columnIndex], rowIndex === 0);
        x += columns[columnIndex];
      });
    });
    context.beginPath();
    context.moveTo(1100, 436);
    context.lineTo(1100, 436 + (rows.length + 1) * rowHeight);
    context.strokeStyle = "#bfdbfe";
    context.lineWidth = 2;
    context.stroke();
    context.lineWidth = 1;
    if (showSavings) {
    const changeRows = [["항목", "증감액 (원/kg)", "증감률", "1톤당 비용 차이"], ...getMarketComparisonChangeRows(comparison)];
    changeRows.forEach((row, rowIndex) => {
      row.forEach((value, column) => {
        const x = 20 + column * 248;
        const y = 716 + rowIndex * 32;
        context.fillStyle = rowIndex === 0 ? "#f1f5f9" : "#ffffff";
        context.fillRect(x, y, 248, 32);
        context.strokeStyle = "#cbd5e1";
        context.strokeRect(x, y, 248, 32);
        context.textAlign = rowIndex === 0 || column === 0 ? "center" : "right";
        text(value, rowIndex === 0 || column === 0 ? x + 124 : x + 236, y + 21, 12, rowIndex === 0 || column === 0, "#0f172a", 224);
        context.textAlign = "left";
      });
    });
    text("증감: 변경 후 − 변경 전 (후처리 포함 단가) · 1톤당 비용 차이: (변경 전 − 변경 후) × 1,000 · 절감 또는 증가로 표시", 20, 865, 11, false, "#64748b", width - 40);
    }
    if (memoLines.length) {
      text("변경 사유·특이사항", 20, memoTop + 16, 14, true, "#0f172a");
      memoLines.forEach((line, index) => text(line, 20, memoTop + 40 + index * 22, 14, false, "#334155", width - 40));
    }
  }
  lines.forEach((line, index) => text(line, 20, 414 + tableHeight + index * 20, 12, false, "#64748b", width - 40));
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("PNG 이미지를 생성하지 못했습니다.")), "image/png",
  ));
}
