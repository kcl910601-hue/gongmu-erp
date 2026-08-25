import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx-js-style";
import { buildProjectCostTemplate, getProjectCostTemplateFileName } from "./excel/project-cost-template.ts";
import { parseCostImportWorkbook } from "./project-cost-import.ts";

const projects=[{project_code:"P-001",project_name:"한글 프로젝트",client_name:"발주처",salesperson:"김영업",task_manager:"박공무",status:"진행중"}];
function fileRows(count:number,vat:unknown="") { const workbook=buildProjectCostTemplate(projects); const sheet=workbook.Sheets["비용 입력"]; const rows=Array.from({length:count},(_,index)=>["P-001","참고명","외주비",`비용 ${index}`,"2026-08-21","","업체","INV-001",1000,vat,"미지급","한글\n메모"]); XLSX.utils.sheet_add_aoa(sheet,rows,{origin:"A5"}); return XLSX.write(workbook,{type:"array",bookType:"xlsx"}) as ArrayBuffer; }

test("양식은 3개 Sheet, 헤더, 목록, 안내와 Dropdown metadata를 만든다",()=>{const workbook=buildProjectCostTemplate(projects);assert.deepEqual(workbook.SheetNames,["비용 입력","프로젝트 목록","작성 안내"]);assert.equal(workbook.Sheets["비용 입력"].A4.v,"프로젝트 코드");assert.equal(workbook.Sheets["프로젝트 목록"].A2.v,"P-001");assert.equal(workbook.Sheets["작성 안내"].B1.v,1);assert.equal((workbook.Sheets["비용 입력"] as XLSX.WorkSheet&{"!dataValidation"?:unknown[]})["!dataValidation"]?.length,3);assert.equal(getProjectCostTemplateFileName(new Date(2026,7,21)),"프로젝트_비용등록_양식_2026-08-21.xlsx");});
test("1, 100, 500건을 직렬화 후 재열어 trim, 한글, 특수문자와 VAT 자동 계산을 보존한다",()=>{for(const count of [1,100,500]){const rows=parseCostImportWorkbook(fileRows(count));assert.equal(rows.length,count);assert.equal(rows[0].project_code,"P-001");assert.equal(rows[0].document_number,"INV-001");assert.equal(rows[0].memo,"한글\n메모");assert.equal(rows[0].vat_amount_krw,100);}});
test("VAT 빈칸, 0, 직접 입력을 구분하고 지급상태 빈칸은 미지급이다",()=>{assert.equal(parseCostImportWorkbook(fileRows(1,""))[0].vat_amount_krw,100);assert.equal(parseCostImportWorkbook(fileRows(1,0))[0].vat_amount_krw,0);assert.equal(parseCostImportWorkbook(fileRows(1,77))[0].vat_amount_krw,77);});
