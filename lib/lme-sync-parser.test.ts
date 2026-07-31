import assert from "node:assert/strict";
import test from "node:test";
import { LmePageStructureError, parseLmeDate, parseLmePage, parseLmePrice } from "./lme-sync-parser.ts";

const fixture = `<!doctype html><html><body><p>현물 US$/톤</p><table><thead><tr><th>일자</th><th>품목</th></tr><tr><th>Cu</th><th>Al</th><th>Zn</th></tr></thead><tbody><tr><td>2024. 02. 15</td><td>8,153.0</td><td>2,205.0</td><td>2,321.5</td></tr></tbody></table></body></html>`;

test("헤더 이름으로 일자와 Al 가격을 추출한다", () => assert.deepEqual(parseLmePage(fixture).rows, [{ referenceDate: "2024-02-15", priceUsdPerTon: 2205 }]));
test("날짜와 가격을 엄격하게 변환한다", () => { assert.equal(parseLmeDate("2024. 02. 29"), "2024-02-29"); assert.equal(parseLmeDate("2023. 02. 29"), null); assert.equal(parseLmePrice("2,205.0"), 2205); assert.equal(parseLmePrice("0"), null); });
test("빈 페이지와 구조 변경을 거부한다", () => { assert.throws(() => parseLmePage("<html><body>현물 US$/톤</body></html>"), LmePageStructureError); assert.throws(() => parseLmePage(fixture.replace("<th>Al</th>", "<th>Aluminium</th>")), LmePageStructureError); });
test("단위가 다르면 저장 후보를 만들지 않는다", () => assert.throws(() => parseLmePage(fixture.replace("현물 US$/톤", "현물 KRW/kg")), LmePageStructureError));
