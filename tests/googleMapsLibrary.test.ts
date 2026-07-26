import assert from "node:assert/strict";
import test from "node:test";
import { requireGoogleMapsLibrary } from "../lib/googleMapsLibrary.ts";

test("loads geometry when Google Maps was initialized earlier without it", async () => {
  const maps:{geometry?:{encoding:object};importLibrary:(name:string)=>Promise<void>}={
    importLibrary:async(name)=>{
      assert.equal(name,"geometry");
      maps.geometry={encoding:{}};
    },
  };
  await requireGoogleMapsLibrary(maps,"geometry",(value)=>Boolean(value.geometry?.encoding));
  assert.ok(maps.geometry?.encoding);
});

test("does not reload an available Google Maps library", async () => {
  let calls=0;
  const maps={geometry:{encoding:{}},importLibrary:async()=>{calls+=1;}};
  await requireGoogleMapsLibrary(maps,"geometry",(value)=>Boolean(value.geometry?.encoding));
  assert.equal(calls,0);
});

test("fails visibly when a preloaded Maps API cannot add geometry", async () => {
  await assert.rejects(
    ()=>requireGoogleMapsLibrary({},"geometry",()=>false),
    /geometry library is unavailable/,
  );
});
