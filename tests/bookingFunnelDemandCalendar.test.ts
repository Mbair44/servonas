import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const read = async (relative: string) =>
 readFile(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("booking funnel page includes rental date demand calendar and inspector copy", async () => {
 const [page, styles] = await Promise.all([
  read("../app/app/[businessSlug]/marketing/funnel/page.tsx"),
  read("../app/globals.css"),
 ]);
 assert.match(page, /Requested rental dates/);
 assert.match(page, /Counts below show the date customers were trying to book for, not the day they clicked/);
 assert.match(page, /marketing-demand-calendar/);
 assert.match(page, /selectedDateDetails/);
 assert.match(styles, /\.marketing-date-demand-panel/);
 assert.match(styles, /\.marketing-demand-day\.is-selected/);
});
