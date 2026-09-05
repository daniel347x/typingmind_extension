// Actual modal renderer/lifecycle/handlers with fake DOM + capture storage.
// No network requests; validates frozen reads, deliberate actions, copy consistency and hot path.
// Usage: node ring_modal_freeze.test.cjs <extension.js>
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2],'utf8');
function extract(name){const m=source.match(new RegExp('^  function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}','m'));if(!m)throw Error(name);return m[0];}
let passed=0,failed=0;function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}}
const SID='9b771fe5',KEY=SID+'::model::host::direct';
function capture(id,model='model',sid=SID){return {id,ts:1000,ts_local:'test time',url:'https://host/v1/chat/completions',protocol:'openai-chat-completions',session_id:sid,_identity:{key:sid+'::'+model+'::host::direct',model,host:'host',proxy:false},body:{model,messages:[{role:'user',content:'body '+id}],tools:[]},response_status:200,response_ok:true,response_body:{text:'response '+id},response_usage:{cost:0.01},_think_req:{protocol:'openai-chat-completions'},_think_obs:null};}
function harness(initial=[capture('one')]){
 let live=initial,costs={[KEY]:{_total:2,_cache_hits:3,_cache_misses:1}},reads=0,costReads=0,discovery=0,summaryCalls=0,hashCalls=0,domWrites=0,clock=100000;const copies=[],reports=[];let ctx;
 const elems={}, storage={}, frames=new Map(); let frameId=0, selection=null;
 class Element {
  constructor(tag){this.nodeType=1;this.tagName=tag.toUpperCase();this.style={};this.children=[];this.handlers={};this.eventOptions={};this.scrollTop=0;this.dataset={};this.attrs={};this.isConnected=true;}
  set innerHTML(v){this.html=v;for(const c of this.children)c.parentNode=null;this.children=[];if(this.id==='tm-payload-capture-modal-body')domWrites++;}
  get innerHTML(){return (this.html||'')+this.children.map(c=>c.outerHTML).join('');}
  get outerHTML(){return '<'+this.tagName+' '+Object.entries(this.attrs).map(([k,v])=>k+'="'+v+'"').join(' ')+'>'+this.innerHTML+(this.textContent||'')+'</'+this.tagName+'>';}
  get offsetTop(){return this.attrs['data-role']==='capture-virtual-list'?100:parseFloat(this.style.top)||0;}
  get clientHeight(){return this.id==='tm-payload-capture-modal-body'?640:parseFloat(this.style.height)||0;}
  setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  closest(q){if(q==='[data-capture-slot]'&&this.attrs['data-capture-slot']!==undefined)return this;return this.parentNode?.closest?.(q)||null;}
  appendChild(e){if(e.parentNode)e.parentNode.removeChild(e);e.parentNode=this;this.children.push(e);if(e.id)elems[e.id]=e;return e;}
  insertBefore(e,before){if(!before)return this.appendChild(e);if(e.parentNode)e.parentNode.removeChild(e);e.parentNode=this;this.children.splice(this.children.indexOf(before),0,e);return e;}
  removeChild(e){this.children=this.children.filter(x=>x!==e);e.parentNode=null;}
  addEventListener(k,fn,opts){(this.handlers[k]||(this.handlers[k]=[])).push(fn);this.eventOptions[k]=opts;}
  removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(x=>x!==fn);}
  querySelector(q){if(q==='[data-role="capture-snapshot-status"]')return label;if(q==='[data-role="capture-window-status"]')return rangeLabel;if(q==='[data-action="set-capture-row-height"]')return heightInput;return null;}
 }

 const label={textContent:''},rangeLabel={textContent:''},heightInput={value:'240',disabled:false};const document={body:new Element('body'),head:new Element('head'),createElement:t=>new Element(t),getElementById:id=>elems[id]||null};const listeners={};const win={addEventListener(k,f){(listeners[k]||(listeners[k]=[])).push(f);},removeEventListener(k,f){listeners[k]=(listeners[k]||[]).filter(x=>x!==f);}};
 win.getSelection=()=>selection;
 const c={console,Date:class extends Date{static now(){return clock;}},document,window:win,TM_CAPTURE_ROW_HEIGHT_KEY:'tm_payload_ring_row_height_v1',tmPayloadCaptureVirtual:null,tmPayloadCaptureDetailId:null,tmPayloadCaptureReturnAnchor:null,requestAnimationFrame:fn=>{const id=++frameId;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),payloadCaptureModalEl:null,payloadCaptureModalInnerEl:null,tmPayloadCaptureSnapshot:null,tmPayloadCaptureModalEscapeKeydownSnapshotter:null,tmPayloadCaptureModalEscapeHandler:null,tmEscapeGuardSnapshot:null,tmPayloadCaptureSuppressEscapeUntil:0,tmPromptActive:false,
 tmModalFilterListboxOpen:false,tmModalFilterIdentity:null,tmModalSortMode:'chronological',tmModalTimeFilter:'all',
 TM_PAYLOAD_CAPTURE_RING_KEY:'ring',TM_PAYLOAD_CAPTURE_ENABLED_KEY:'enabled',TM_PAYLOAD_CAPTURE_MAX_ENTRIES:500,TM_PAYLOAD_CAPTURE_MAX_OUTBOUND_CHARS:1000,TM_PAYLOAD_CAPTURE_MAX_RESPONSE_CHARS:1000,TM_PAYLOAD_CAPTURE_MAX_RICH_ENTRIES:100,
 tmReadCaptureRing(){reads++;return JSON.parse(JSON.stringify(live));},tmGetSessionCosts(){costReads++;return JSON.parse(JSON.stringify(costs));},getCaptureById:id=>JSON.parse(JSON.stringify(live.find(c=>c.id===id)||null)),tmDiscoverAndMergeProviderRatings(){discovery++;},tmDiscoverAndMergeProviderCosts(){discovery++;},
 tmBuildSessionCostKey:(s,m,h,p)=>[s,m,h,p?'proxy':'direct'].join('::'),tmCaptureModel:cap=>cap._identity?.model||cap.body?.model||'',tmComputeSystemToolsPrefixHash:b=>{hashCalls++;return 'hash-'+(b?.messages?.[0]?.content||'empty');},
 tmCapIdentityKey:cap=>cap._identity.key,tmCapIdentityLabel:cap=>({label:cap.session_id,model:cap._identity.model,host:'host',sid:cap.session_id,isProxy:false}),tmModelEndpointColor:()=>'#abcdef',tmExtractEndpointHost:()=>'host',tmIsProxyCapture:()=>false,
 tmGetHideRetries:()=>false,tmSetHideRetries(){},tmIsRetryRow:()=>false,tmIsDeadProxyProbeRow:()=>false,tmApplyTimeFilter:items=>items,tmAgentManagementEnabled:()=>false,tmBuildCaptureStatusBanner:()=>'<div>Capture enabled</div>',tmGetSolReasoningEffort:()=>'high',tmGetModelProviderMap:()=>({}),tmGetProviderEntries:()=>[],tmShouldBlockOpenRouterGemini:()=>true,tmCaptureEnabled:()=>true,
 tmSortModalItems:items=>{if(ctx.tmModalSortMode==='turn-cost')items.reverse();return items;},tmBuildTimelineSeparator:()=>'',tmIsMultiProviderModel:()=>false,tmThinkControlSupportedForIdentity:()=>false,tmIsSignificantCacheHit:()=>true,tmExtractCostVal:(au,u)=>u?.cost||0,tmRenderRepairBlocks:()=>'',tmRenderCacheReport:()=>'cache',tmRenderCtxDial:()=>'',tmRenderThinkBadge:()=>'',tmGetSessionName:()=>'',tmBuildCaptureSummary:cap=>{summaryCalls++;return {id:cap.id,model:cap.body.model,body:cap.body};},
 tmThinkClassifyReq:()=>({glyphs:[]}),tmThinkClassifyObs:()=>({glyphs:[]}),tmThinkCompactReq:()=>'',tmThinkCompactObs:()=>'',tmThinkInterpret:()=>[],tmAnyChildModalOpen:()=>false,
 copyTextToClipboard:(txt,label)=>copies.push({txt,label}),tmShowJsonViewerModal:(txt,label)=>reports.push({txt,label}),renderGpt51UsageWidget(){},tmSetSessionName(){},prompt:()=>null,setTimeout:()=>1,localStorage:{getItem:k=>storage[k]??null,setItem(k,v){storage[k]=String(v);}}
 };
 ctx=vm.createContext(c);
 const funcs=['tmCaptureRowHeight','tmCaptureVisibleRange','tmReleaseCaptureVirtualList','tmCaptureListAnchor','tmRestoreCaptureListAnchor','tmCreateCaptureVirtualSlot','tmUpdateCaptureVirtualList','tmScheduleCaptureVirtualUpdate','tmMountCaptureRows','tmOpenCaptureFullEntry','tmBackToCaptureList','tmSetCaptureRowHeight','escapeHtml','tmCreatePayloadCaptureSnapshot','tmPreparePayloadCaptureRender','tmGetPayloadCaptureViewRecord','tmPayloadCaptureViewCost','tmPayloadCaptureRowMetadata','tmCollectRingModels','ensurePayloadCaptureModal','renderPayloadCaptureModal','tmRenderPayloadCaptureModalSnapshot','openPayloadCaptureModal','closePayloadCaptureModal','copyPayloadCapturePart','tmShowThinkReport'];
 vm.runInContext(funcs.map(extract).join('\n'),ctx);
 function action(act,type='click',extra={}){const t={dataset:{action:act,...extra.dataset},value:extra.value,closest(selector){return selector.includes('[data-action="'+act+'"]')?this:null;}};const ev={target:t,stopPropagation(){},preventDefault(){}};for(const handler of ctx.payloadCaptureModalEl.handlers[type]||[])handler(ev);}
 return {c:ctx,document,win,label,rangeLabel,heightInput,copies,reports,action,storage,frames,flushFrames:()=>{for(const [id,fn] of [...frames]){frames.delete(id);fn();}},setSelection:x=>{selection=x;},live:()=>live,setLive:x=>live=x,setCosts:x=>costs=x,advance:x=>clock+=x,counts:()=>({reads,costReads,discovery,summaryCalls,hashCalls,domWrites}),listeners};
}
test('opening creates one snapshot; 1000 background renders do no reads/writes',()=>{const h=harness();h.c.openPayloadCaptureModal();const before=h.counts(),snap=h.c.tmPayloadCaptureSnapshot;for(let i=0;i<1000;i++)assert.equal(h.c.renderPayloadCaptureModal(),false);assert.deepEqual(h.counts(),before);assert.equal(h.c.tmPayloadCaptureSnapshot,snap);assert.match(h.label.textContent,/Frozen at/);});
test('background capture arrival/completion does not alter open rows or snapshot',()=>{const h=harness();h.c.openPayloadCaptureModal();const html=h.c.payloadCaptureModalInnerEl.innerHTML;h.live()[0].response_body.text='newer response';h.live().push(capture('two'));h.c.renderPayloadCaptureModal();assert.equal(h.c.payloadCaptureModalInnerEl.innerHTML,html);assert.equal(h.c.tmPayloadCaptureSnapshot.ring.length,1);assert.equal(h.c.tmPayloadCaptureSnapshot.byId.one.response_body.text,'response one');});
test('Refresh explicitly acquires latest data and resets to top',()=>{const h=harness();h.c.openPayloadCaptureModal();h.c.payloadCaptureModalInnerEl.scrollTop=400;h.live().push(capture('two'));h.action('refresh-payload-capture-modal');assert.equal(h.c.tmPayloadCaptureSnapshot.ring.length,2);assert.equal(h.c.payloadCaptureModalInnerEl.scrollTop,0);assert.match(h.c.payloadCaptureModalInnerEl.innerHTML,/data-capture-id="two"/);});
test('filter/listbox/sort/time/noise actions use the same snapshot without reacquiring',()=>{const h=harness([capture('one'),capture('two','other','different')]);h.c.openPayloadCaptureModal();const snap=h.c.tmPayloadCaptureSnapshot,before=h.counts();h.c.payloadCaptureModalInnerEl.scrollTop=50;h.action('toggle-modal-filter-listbox');assert.equal(h.c.tmModalFilterListboxOpen,true);h.action('set-modal-filter-listbox','click',{dataset:{identityKey:KEY}});assert.equal(h.c.tmModalFilterIdentity,KEY);assert.doesNotMatch(h.c.payloadCaptureModalInnerEl.innerHTML,/data-capture-id="two"/);h.action('set-modal-sort','click',{dataset:{sortMode:'turn-cost'}});h.action('set-modal-time-filter','change',{value:'12h'});h.action('toggle-hide-retries');assert.equal(h.c.tmPayloadCaptureSnapshot,snap);assert.equal(h.counts().reads,before.reads);assert.equal(h.counts().discovery,before.discovery);assert.equal(h.counts().costReads,before.costReads);assert.equal(h.c.payloadCaptureModalInnerEl.scrollTop,50);});
test('row-copy remains the displayed bytes after eviction from the live ring',()=>{const h=harness();h.c.openPayloadCaptureModal();h.setLive([capture('two')]);h.c.copyPayloadCapturePart('one','in_payload');assert.equal(JSON.parse(h.copies.at(-1).txt).body.text,'response one');h.c.copyPayloadCapturePart('one','summary');assert.equal(JSON.parse(h.copies.at(-1).txt).id,'one');assert.equal(h.counts().summaryCalls,1);});
test('an ID absent from an open snapshot is not silently read from live storage',()=>{const h=harness();h.c.openPayloadCaptureModal();h.live().push(capture('new'));assert.equal(h.c.tmGetPayloadCaptureViewRecord('new'),null);h.c.copyPayloadCapturePart('new','summary');assert.equal(h.copies.length,0);});
test('thinking-report click uses displayed snapshot, not subsequently changed evidence',()=>{const h=harness();h.live()[0]._think_req={summary:'before'};h.c.openPayloadCaptureModal();h.live()[0]._think_req.summary='after';h.action('think-report','click',{dataset:{captureId:'one'}});assert.equal(JSON.parse(h.reports.at(-1).txt).requested.summary,'before');});
test('close releases snapshot; hidden notifications do no work; reopen is fresh',()=>{const h=harness();h.c.openPayloadCaptureModal();h.c.closePayloadCaptureModal();assert.equal(h.c.tmPayloadCaptureSnapshot,null);const before=h.counts();h.live().push(capture('two'));h.c.renderPayloadCaptureModal();h.c.renderPayloadCaptureModal('view');assert.deepEqual(h.counts(),before);h.c.openPayloadCaptureModal();assert.equal(h.c.tmPayloadCaptureSnapshot.ring.length,2);});
test('Escape first closes listbox, second closes modal; no accumulating listeners',()=>{const h=harness();h.c.openPayloadCaptureModal();h.c.tmModalFilterListboxOpen=true;const ev={key:'Escape',code:'Escape',stopPropagation(){},preventDefault(){}};for(const f of [...h.listeners.keydown])f(ev);for(const f of [...h.listeners.keyup])f(ev);assert.equal(h.c.tmModalFilterListboxOpen,false);assert.equal(h.c.payloadCaptureModalEl.style.display,'block');for(const f of [...h.listeners.keydown])f(ev);for(const f of [...h.listeners.keyup])f(ev);assert.equal(h.c.payloadCaptureModalEl.style.display,'none');assert.equal(h.listeners.keyup.length,0);h.c.openPayloadCaptureModal();assert.equal(h.listeners.keydown.length,1);assert.equal(h.listeners.keyup.length,1);});
test('500 rows do not build full summaries; redisplay reuses prefix hash metadata',()=>{const h=harness(Array.from({length:500},(_,i)=>capture('capture'+i)));h.c.openPayloadCaptureModal();assert.equal(h.counts().summaryCalls,0);assert.equal(h.counts().hashCalls,500);const before=h.counts();h.c.renderPayloadCaptureModal('view');assert.equal(h.counts().hashCalls,before.hashCalls);assert.equal(h.counts().reads,before.reads);assert.equal(h.counts().costReads,before.costReads);assert.equal(h.c.tmPayloadCaptureSnapshot.rows.length,500);assert.ok(Object.keys(h.c.tmPayloadCaptureVirtual.slots).length<=9);assert.doesNotMatch(h.c.payloadCaptureModalInnerEl.innerHTML,/#500/);});
test('cost totals stay at snapshot values until Refresh',()=>{const h=harness();h.c.openPayloadCaptureModal();assert.match(h.c.payloadCaptureModalInnerEl.innerHTML,/\$2\.00/);h.setCosts({[KEY]:{_total:999}});h.c.renderPayloadCaptureModal('view');assert.doesNotMatch(h.c.payloadCaptureModalInnerEl.innerHTML,/\$999\.00/);h.action('refresh-payload-capture-modal');assert.match(h.c.payloadCaptureModalInnerEl.innerHTML,/\$999\.00/);});
test('empty snapshot remains frozen until Refresh',()=>{const h=harness([]);h.c.openPayloadCaptureModal();assert.match(h.c.payloadCaptureModalInnerEl.innerHTML,/No captured payloads in this snapshot/);h.live().push(capture('one'));h.c.renderPayloadCaptureModal();assert.equal(h.c.tmPayloadCaptureSnapshot.ring.length,0);h.action('refresh-payload-capture-modal');assert.equal(h.c.tmPayloadCaptureSnapshot.ring.length,1);});
test('explicitly missing snapshot report never substitutes live data',()=>{const h=harness();h.c.openPayloadCaptureModal();h.c.tmShowThinkReport('one',null);assert.equal(h.reports.length,0);h.c.tmShowThinkReport('one');assert.equal(h.reports.length,1);});
test('explicit setting callbacks still request a view render',()=>{for(const n of ['tmHandleThinkControlChange','tmHandleProviderRoutingChange','tmCtxDialPromptSet']){const code=extract(n);assert.match(code,/renderPayloadCaptureModal\('view'\)/,n);assert.doesNotMatch(code,/renderPayloadCaptureModal\(\)/,n);}});

// v4.380: bounded mounting and native-scroll geometry.
function manyRows(){return Array.from({length:500},(_,i)=>capture('capture'+i));}
test('only visible fixed-height slots mount; full scrollbar extent stays 500 rows',()=>{
 const h=harness(manyRows());h.c.openPayloadCaptureModal();const v=h.c.tmPayloadCaptureVirtual;
 assert.equal(v.height,240);assert.equal(v.list.style.height,'120000px');assert.ok(Object.keys(v.slots).length<=9);
 for(const [index,slot] of Object.entries(v.slots)){assert.equal(slot.style.top,Number(index)*240+'px');assert.equal(slot.style.height,'240px');assert.equal(slot._tmCaptureContent.style.overflow,'hidden');assert.match(slot.innerHTML,/Open full entry/);}
 assert.match(h.rangeLabel.textContent,/of 500/);
});
test('trackball scroll handling is passive and coalesced into one animation-frame update',()=>{
 const h=harness(manyRows());h.c.openPayloadCaptureModal();const body=h.c.payloadCaptureModalInnerEl;const before=h.counts();
 assert.equal(body.eventOptions.scroll.passive,true);assert.equal(body.handlers.wheel,undefined);
 body.scrollTop=100+400*240;for(let i=0;i<100;i++)for(const f of body.handlers.scroll)f();
 assert.equal(h.frames.size,1);h.flushFrames();assert.equal(h.frames.size,0);
 const v=h.c.tmPayloadCaptureVirtual;assert.ok(v.slots[400]);assert.ok(Object.keys(v.slots).length<=9);assert.equal(v.slots[0],undefined);
 assert.equal(h.counts().reads,before.reads);assert.equal(h.counts().hashCalls,before.hashCalls);assert.equal(h.counts().domWrites,before.domWrites);
});
test('overlapping mounted nodes are retained and remain in index order while scrolling both ways',()=>{
 const h=harness(manyRows());h.c.openPayloadCaptureModal();const keep=h.c.tmPayloadCaptureVirtual.slots[2];
 h.c.payloadCaptureModalInnerEl.scrollTop=100+240;h.c.tmUpdateCaptureVirtualList();assert.equal(h.c.tmPayloadCaptureVirtual.slots[2],keep);
 h.c.payloadCaptureModalInnerEl.scrollTop=100+40*240;h.c.tmUpdateCaptureVirtualList();
 h.c.payloadCaptureModalInnerEl.scrollTop=100+39*240;h.c.tmUpdateCaptureVirtualList();
 const indices=h.c.tmPayloadCaptureVirtual.list.children.map(n=>Number(n.getAttribute('data-capture-slot')));assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
});
test('a focused or selected slot is not unmounted until focus/selection leaves it',()=>{
 const h=harness(manyRows());h.c.openPayloadCaptureModal();let v=h.c.tmPayloadCaptureVirtual;const kept=v.slots[2];
 h.document.activeElement=kept._tmCaptureContent;h.c.payloadCaptureModalInnerEl.scrollTop=100+100*240;h.c.tmUpdateCaptureVirtualList();assert.equal(v.slots[2],kept);
 h.document.activeElement=null;h.setSelection({isCollapsed:false,anchorNode:{nodeType:3,parentElement:kept._tmCaptureContent},focusNode:kept._tmCaptureContent});h.c.tmUpdateCaptureVirtualList();assert.equal(v.slots[2],kept);
 h.setSelection(null);h.c.tmUpdateCaptureVirtualList();assert.equal(v.slots[2],undefined);
});
test('row-height control persists and retains the same top entry and fractional position',()=>{
 const h=harness(manyRows());h.c.openPayloadCaptureModal();h.c.payloadCaptureModalInnerEl.scrollTop=100+50.5*240;h.c.tmUpdateCaptureVirtualList();
 const before=h.counts();h.action('set-capture-row-height','change',{value:'400'});const v=h.c.tmPayloadCaptureVirtual;
 assert.equal(v.height,400);assert.equal(v.list.style.height,'200000px');assert.equal(h.c.payloadCaptureModalInnerEl.scrollTop,100+50.5*400);assert.equal(h.heightInput.value,'400');assert.equal(h.storage.tm_payload_ring_row_height_v1,'400');assert.equal(h.counts().reads,before.reads);
 h.c.closePayloadCaptureModal();h.c.openPayloadCaptureModal();assert.equal(h.c.tmPayloadCaptureVirtual.height,400);
});
test('row-height values are bounded and invalid input cannot create broken geometry',()=>{
 const h=harness(manyRows());h.c.openPayloadCaptureModal();h.c.tmSetCaptureRowHeight('9999');assert.equal(h.c.tmPayloadCaptureVirtual.height,800);h.c.tmSetCaptureRowHeight('1');assert.equal(h.c.tmPayloadCaptureVirtual.height,180);h.c.tmSetCaptureRowHeight('nonsense');assert.equal(h.c.tmPayloadCaptureVirtual.height,180);
});
test('full entry is uncut, its copy buttons work, and Back restores list position',()=>{
 const rows=manyRows();rows[449].error={message:'LONG '.repeat(2000)+'END_OF_ERROR',status:500};
 const h=harness(rows);h.c.openPayloadCaptureModal();h.c.payloadCaptureModalInnerEl.scrollTop=100+50.25*240;h.c.tmUpdateCaptureVirtualList();
 const id=h.c.tmPayloadCaptureSnapshot.rows[50].id,position=h.c.payloadCaptureModalInnerEl.scrollTop,before=h.counts();
 h.action('open-capture-full-entry','click',{dataset:{captureId:id}});assert.equal(h.c.tmPayloadCaptureVirtual,null);assert.equal(h.heightInput.disabled,true);assert.match(h.c.payloadCaptureModalInnerEl.innerHTML,/END_OF_ERROR/);assert.match(h.c.payloadCaptureModalInnerEl.innerHTML,/back-capture-list/);
 h.action('copy-payload-capture','click',{dataset:{captureId:id,part:'error'}});assert.match(JSON.parse(h.copies.at(-1).txt).message,/END_OF_ERROR/);
 h.c.renderPayloadCaptureModal('view');assert.equal(h.c.tmPayloadCaptureDetailId,id);assert.equal(h.c.tmPayloadCaptureVirtual,null);
 h.action('back-capture-list');assert.equal(h.c.tmPayloadCaptureDetailId,null);assert.equal(h.heightInput.disabled,false);assert.equal(h.c.payloadCaptureModalInnerEl.scrollTop,position);assert.ok(h.c.tmPayloadCaptureVirtual.slots[50]);assert.equal(h.counts().reads,before.reads);
});
test('Refresh exits detail mode and shows the latest snapshot',()=>{
 const h=harness();h.c.openPayloadCaptureModal();h.action('open-capture-full-entry','click',{dataset:{captureId:'one'}});h.live().push(capture('two'));h.action('refresh-payload-capture-modal');assert.equal(h.c.tmPayloadCaptureDetailId,null);assert.equal(h.c.tmPayloadCaptureSnapshot.rows.length,2);assert.ok(h.c.tmPayloadCaptureVirtual);
});
test('closing cancels pending animation frames and repeated opens do not add scroll/resize handlers',()=>{
 const h=harness(manyRows());h.c.openPayloadCaptureModal();h.c.tmScheduleCaptureVirtualUpdate();assert.equal(h.frames.size,1);h.c.closePayloadCaptureModal();assert.equal(h.frames.size,0);assert.equal(h.c.tmPayloadCaptureVirtual,null);
 for(let i=0;i<5;i++){h.c.openPayloadCaptureModal();h.c.closePayloadCaptureModal();}
 assert.equal(h.c.payloadCaptureModalInnerEl.handlers.scroll.length,1);assert.equal(h.listeners.resize.length,1);
});
test('range arithmetic handles first/middle/last entries and empty lists without gaps',()=>{
 const h=harness();let r=h.c.tmCaptureVisibleRange(500,240,100+498*240,640,100);assert.equal(r.first,498);assert.equal(r.last,500);assert.equal(r.end,500);assert.ok(r.start<=498);
 r=h.c.tmCaptureVisibleRange(0,240,0,640,100);assert.equal(r.first,0);assert.equal(r.last,0);assert.equal(r.end,0);
});

test('compact slots use natural content height and an in-flow full-entry button',()=>{
 const h=harness();h.c.openPayloadCaptureModal();const slot=h.c.tmPayloadCaptureVirtual.slots[0];
 assert.match(slot.style.cssText,/display:flex;flex-direction:column/);assert.equal(slot._tmCaptureContent.style.height,undefined);assert.equal(slot._tmCaptureContent.style.maxHeight,'210px');assert.doesNotMatch(slot.children[1].style.cssText,/position:absolute|bottom:/);assert.match(slot.children[1].style.cssText,/flex:0 0 auto/);
});
test('a deliberately saved row height is preserved over the smaller default',()=>{
 const h=harness();h.storage.tm_payload_ring_row_height_v1='320';h.c.openPayloadCaptureModal();assert.equal(h.c.tmPayloadCaptureVirtual.height,320);
});
console.log(`\n${passed} passed; ${failed} failed`);process.exitCode=failed?1:0;
