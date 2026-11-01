import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
const source=readFileSync(new URL("../../src/frontend/runtime/guest-order-recovery.mjs",import.meta.url),"utf8");
const body=source.slice(source.indexOf("async function recover("),source.indexOf("function inspect()"));

test("guest recovery publishes to the replacement card when routing redraws during lookup", async () => {
  let resolveLookup;
  const old={isConnected:true,dataset:{},querySelector:()=>({textContent:""})};
  const replacement={isConnected:true,dataset:{},querySelector:()=>({textContent:""})};
  const rendered=[];
  const lookup={orderId:"RB-GUEST-123",lookupToken:"retained-capability"};
  const context=createContext({inFlight:new Map(),
    SUPABASE_URL:"",SUPABASE_KEY:"",location:{origin:"http://localhost"},
    lookupGuestOrderRequest:()=>new Promise(resolve=>{resolveLookup=resolve;}),
    currentOrderId:()=>lookup.orderId,
    missingOrderCard:()=>replacement,
    normalizeServerOrder:x=>x.order,
    loadGuestLookupSession:()=>lookup,sessionStorage:{},
    renderRecoveredOrder:(card,order)=>rendered.push({card,order}),queueInspect:()=>{},
  });
  runInContext(body,context);
  const loading=context.recover(lookup.orderId,old,lookup);
  old.isConnected=false;
  resolveLookup({order:{id:lookup.orderId,status:"canceled"}});
  await loading;
  assert.equal(rendered.length,1,"A replaced loading card must not swallow a valid response");
  assert.equal(rendered[0].card,replacement);
  assert.equal(context.inFlight.size,0);
});

for (const change of ["route", "token"]) {
  test(`guest recovery never publishes after ${change} changes`, async () => {
    let resolveLookup;
    let route="RB-GUEST-123";
    let currentLookup={orderId:route,lookupToken:"old-capability"};
    const lookup={...currentLookup};
    const card={isConnected:true,dataset:{},querySelector:()=>({textContent:""})};
    const rendered=[];
    const context=createContext({inFlight:new Map(),SUPABASE_URL:"",SUPABASE_KEY:"",location:{origin:"http://localhost"},
      lookupGuestOrderRequest:()=>new Promise(resolve=>{resolveLookup=resolve;}),currentOrderId:()=>route,
      missingOrderCard:()=>card,normalizeServerOrder:x=>x.order,
      loadGuestLookupSession:()=>currentLookup,sessionStorage:{},renderRecoveredOrder:(...args)=>rendered.push(args)});
    runInContext(body,context);
    const loading=context.recover(route,card,lookup);
    if(change==="route")route="RB-GUEST-456";else currentLookup={...lookup,lookupToken:"new-capability"};
    resolveLookup({order:{id:lookup.orderId}});await loading;
    assert.equal(rendered.length,0,"Stale capability cannot publish order data");
  });
}
