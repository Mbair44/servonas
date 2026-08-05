import assert from "node:assert/strict";
import test from "node:test";
import {nextMonthlyDayAnchor,nextMonthlyWeekdayAnchor,nextOccurrenceDate,previewOccurrences} from "../lib/servicePlanRecurrence.ts";

test("supports weekly and custom intervals",()=>{
 assert.deepEqual(previewOccurrences("2026-08-05",2,"week",3),["2026-08-05","2026-08-19","2026-09-02"]);
 assert.equal(nextOccurrenceDate("2026-08-05",10,"day",1),"2026-08-15");
});
test("monthly recurrence preserves the anchor and month-end intent",()=>{
 assert.deepEqual(previewOccurrences("2026-01-31",1,"month",5),["2026-01-31","2026-02-28","2026-03-31","2026-04-30","2026-05-31"]);
 assert.deepEqual(previewOccurrences("2024-01-30",1,"month",3),["2024-01-30","2024-02-29","2024-03-30"]);
});
test("monthly plans can repeat by calendar day or ordinal weekday",()=>{
 assert.equal(nextMonthlyDayAnchor("2026-08-05",5),"2026-08-05");
 assert.equal(nextMonthlyDayAnchor("2026-08-06",5),"2026-09-05");
 assert.equal(nextMonthlyWeekdayAnchor("2026-08-01",1,3),"2026-08-05");
 assert.deepEqual(previewOccurrences("2026-08-05",1,"month_weekday",4),["2026-08-05","2026-09-02","2026-10-07","2026-11-04"]);
});
test("yearly leap-day recurrence uses the last valid day",()=>{
 assert.deepEqual(previewOccurrences("2024-02-29",1,"year",3),["2024-02-29","2025-02-28","2026-02-28"]);
});
test("respects an optional end date",()=>{
 assert.deepEqual(previewOccurrences("2026-08-05",1,"month",12,"2026-10-05"),["2026-08-05","2026-09-05","2026-10-05"]);
});
