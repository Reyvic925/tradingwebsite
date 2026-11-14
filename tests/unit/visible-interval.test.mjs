import assert from 'node:assert/strict';
import { startVisibleInterval } from '../../src/lib/visible-interval.ts';
const original={document:globalThis.document,window:globalThis.window,clearInterval:globalThis.clearInterval};
class Document extends EventTarget { visibilityState='visible'; }
const doc=new Document(),timers=new Map();let next=0;
globalThis.document=doc;globalThis.window={setInterval:callback=>{const id=++next;timers.set(id,callback);return id;},clearInterval:id=>timers.delete(id)};
globalThis.clearInterval=id=>timers.delete(id);
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
try {
  let calls=0;const stop=startVisibleInterval(()=>calls++,1000);stop();await settle();
  assert.equal(calls,0,'cleanup cancels an initial callback that has not started');
  let release;const block=new Promise(resolve=>{release=resolve;});
  const stop2=startVisibleInterval(async()=>{calls++;await block;},1000);await settle();
  assert.equal(calls,1);for(const callback of timers.values())callback();await settle();assert.equal(calls,1,'slow requests cannot overlap');
  release();await settle();
  doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);
  doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(calls,2,'resume refreshes immediately');stop2();
  console.log('VISIBLE_INTERVAL_TESTS_PASSED');
}finally{globalThis.document=original.document;globalThis.window=original.window;globalThis.clearInterval=original.clearInterval;}
