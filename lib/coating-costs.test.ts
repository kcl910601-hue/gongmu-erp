import assert from"node:assert/strict";import test from"node:test";import{isSingleProjectFullAllocation,normalizeMonth,parseKrw}from"./coating-costs.ts";
test("귀속연월을 월 1일 date로 정규화한다",()=>assert.equal(normalizeMonth("2026-08"),"2026-08-01"));
test("잘못된 연월을 차단한다",()=>assert.throws(()=>normalizeMonth("2026-13"),/귀속연월/));
test("KRW는 0 이상의 safe integer만 허용한다",()=>{assert.equal(parseKrw("35000000","공급가액"),35_000_000);assert.throws(()=>parseKrw(-1,"공급가액"));assert.throws(()=>parseKrw(1.5,"공급가액"));});
test("단일 프로젝트 100% 배분만 Quick Entry 수정 대상으로 판정한다",()=>{assert.equal(isSingleProjectFullAllocation(12_000_000,[{allocated_supply_amount_krw:12_000_000,status:"active"}]),true);assert.equal(isSingleProjectFullAllocation(12_000_000,[{allocated_supply_amount_krw:8_000_000,status:"active"},{allocated_supply_amount_krw:4_000_000,status:"active"}]),false);assert.equal(isSingleProjectFullAllocation(12_000_000,[{allocated_supply_amount_krw:10_000_000,status:"active"}]),false);});
