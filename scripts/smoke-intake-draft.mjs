import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
const source=fs.readFileSync(new URL('../src/app/intakeDraft.ts',import.meta.url),'utf8');
const code=transformSync(source,{loader:'ts',format:'cjs'}).code;
const rows=new Map(),storage=new Map();
const db={ transaction(){const transaction={ objectStore(){return {
  put(row){queueMicrotask(()=>{rows.set(row.userId,structuredClone(row));transaction.oncomplete?.();});},
  delete(id){queueMicrotask(()=>{rows.delete(id);transaction.oncomplete?.();});},
  get(id){const request={};queueMicrotask(()=>{request.result=rows.get(id);request.onsuccess?.();});return request;},
};}};return transaction;} };
const ctx={module:{exports:{}},indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess?.());return request;}},sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
vm.runInNewContext(code,ctx);const {saveIntakeDraft,clearIntakeDraft,loadIntakeDraft,loadIntakeDraftPhotos}=ctx.module.exports;
const draft={userId:901,propertyId:101,intakePhase:'describe',description:'Fixture issue',mediaDataUrls:['data:image/png;base64,aGVsbG8='],mediaType:'image/png'};
assert.equal(await saveIntakeDraft(draft),true);
assert.equal(loadIntakeDraft(902),null);
let saved=loadIntakeDraft(901);assert.equal(saved.mediaDataUrls,undefined);
assert.equal((await loadIntakeDraftPhotos(saved)).length,1);
assert.equal((await loadIntakeDraftPhotos({...saved,propertyId:102})).length,0);
console.log('PASS draft photos restore only for the saved user, property and revision; session metadata excludes image bytes');
const oldSave=saveIntakeDraft({...draft,description:'Obsolete revision'});
clearIntakeDraft();
const newSave=saveIntakeDraft({...draft,description:'New request',mediaDataUrls:['data:image/png;base64,bmV3']});
await oldSave;assert.equal(await newSave,true);
saved=loadIntakeDraft(901);assert.equal(saved.description,'New request');
assert.equal((await loadIntakeDraftPhotos(saved))[0],'data:image/png;base64,bmV3');
console.log('PASS clear and immediate new save cannot delete the new request photos');
clearIntakeDraft();await new Promise(resolve=>setImmediate(resolve));assert.equal(loadIntakeDraft(901),null);assert.equal(rows.has(901),false);
console.log('PASS clearing removes metadata and the old user photo row');
