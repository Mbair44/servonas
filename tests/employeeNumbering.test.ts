import assert from "node:assert/strict";
import test from "node:test";
import {defaultEmployeeNumbering,formatEmployeeNumber,validateEmployeeNumbering} from "../lib/employeeNumbering.ts";
test("new businesses begin at employee number 1001",()=>assert.equal(formatEmployeeNumber(defaultEmployeeNumbering.prefix,defaultEmployeeNumbering.nextNumber,defaultEmployeeNumbering.minimumDigits),"1001"));
test("employee numbering formats prefixes and zero padding",()=>{assert.equal(formatEmployeeNumber("EMP-",42,4),"EMP-0042");assert.equal(formatEmployeeNumber("TECH-",10000,4),"TECH-10000");});
test("employee numbering validates sequence, padding, and prefix",()=>{assert.match(validateEmployeeNumbering({...defaultEmployeeNumbering,nextNumber:0})!,/positive/);assert.match(validateEmployeeNumbering({...defaultEmployeeNumbering,minimumDigits:11})!,/between/);assert.match(validateEmployeeNumbering({...defaultEmployeeNumbering,prefix:"bad prefix"})!,/Prefix/);});
