import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { Bridge, Backend, learnerText } from './bridge.mjs';
import { formFor, answerFor, pendingQuestionOf, visibleRows, planEntries, courseTitle, plainMath } from './core.mjs';
const {startACPBridge,allowed}=createRequire(import.meta.url)('../electron/acp-bridge.cjs');
const call={type:'toolCall',id:'q1',name:'quiz',arguments:{type:'check',question:'第二次握手的 ack 是多少？',options:[{label:'100',value:'a'},{label:'101',value:'b'}],correctAnswer:['b'],explanation:'SYN 消耗一个序号。'}};
const record=()=>({id:'chat_test',title:'ACP 测试',messages:[{id:'m1',role:'assistant',content:[{type:'text',text:'先理解 SYN 的作用。'},call],timestamp:1,stopReason:'toolUse'}],turnInFlight:false});
test('backend preserves Chinese and emoji split across response chunks',async()=>{
 const data={text:'引入统一协议 🧠'};
 const response=raw=>{const bytes=Buffer.from(raw);const res=Readable.from(Array.from(bytes,b=>Buffer.from([b])));res.statusCode=200;return res;};
 const backend=new Backend();backend.response=async()=>response(JSON.stringify(data));
 assert.deepEqual(await backend.json('/api/chats/chat_test'),data);
 backend.response=async()=>response(`data: ${JSON.stringify(data)}\n\n`);
 const events=[];await backend.stream('chat_test',e=>events.push(e));assert.deepEqual(events,[data]);
});
test('quiz uses canonical shuffled options and grading without leaking answers',()=>{
 const p=pendingQuestionOf(record().messages);const form=formFor(p);
 assert.deepEqual(Object.keys(form.properties),['answer']);
 const minimal=answerFor(p,{answer:'b'});
 assert.equal(minimal.correct,true);assert.equal(minimal.thinking,undefined);assert.equal(minimal.readingThinking,undefined);
 assert.equal(minimal.confidence,80);
 assert.equal(answerFor(p,{answer:'b',confidence:''}).confidence,80);
 assert.equal(answerFor(p,{answer:'__lh_dont_know__'}).confidence,undefined);
 assert.deepEqual(Object.keys(formFor({...p,tool:'ask_user_question'}).properties),['answer']);
 assert.equal(JSON.stringify(form).includes('correctAnswer'),false);assert.equal(JSON.stringify(form).includes('SYN 消耗'),false);
 const answer=answerFor(p,{answer:'b',confidence:'70',thinking:'序号加一',readingThinking:'SYN 占一个编号'});
 assert.equal(answer.correct,true);assert.equal(answer.confidence,70);assert.equal(answer.thinking,'序号加一');assert.equal(answer.readingThinking,'SYN 占一个编号');
 assert.equal(answerFor(p,{answer:'__lh_dont_know__',confidence:'70'}).confidence,undefined);
 const label=form.properties.answer.enum.find(x=>x==='101');
 assert.ok(label);assert.equal(form.properties.answer.enum.at(-1),'暂时不知道');assert.equal(form.properties.answer.title,'理解检查');
 assert.equal(answerFor(p,{answer:label,thinking:'跳过（不填写）'}).correct,true);
 assert.equal(answerFor(p,{answer:label,readingThinking:'跳过（不填写）'}).readingThinking,undefined);
 assert.throws(()=>answerFor(p,{answer:'z'}));assert.throws(()=>answerFor(p,{answer:['a','b']}));assert.throws(()=>answerFor(p,{answer:'b',confidence:'NaN'}));
});
test('form mirrors desktop dock: kind label, plan node, math-safe unique choices',()=>{
 const math={...call,arguments:{...call.arguments,type:'predict',nodeId:'n1',question:'$M \\times N$ 是多少？',options:[{label:'$4 \\times 5 = 20$',value:'a'},{label:'同一选项',value:'b'},{label:'同一选项 ',value:'c'}],correctAnswer:['a']}};
 const p=pendingQuestionOf([{id:'m1',role:'assistant',content:[math],timestamp:1,stopReason:'toolUse'}]);
 const field=formFor(p,{nodes:[{id:'n1',title:'解耦动机'}]}).properties.answer;
 assert.equal(field.title,'先做预测 · 解耦动机');assert.match(field.description,/\$M \\times N\$/);
 assert.ok(field.enum.every(x=>/^\d\. /.test(x)||x==='暂时不知道'));
 assert.equal(plainMath('$4 \\times 5 = 20$ 套'),'4 × 5 = 20 套');
 const unique={...math,arguments:{...math.arguments,options:[{label:'$4 \\times 5$',value:'a'},{label:'$9$',value:'b'}]}};
 const q=pendingQuestionOf([{id:'m1',role:'assistant',content:[unique],timestamp:1,stopReason:'toolUse'}]);
 assert.ok(formFor(q).properties.answer.enum.includes('4 × 5'));assert.equal(answerFor(q,{answer:'4 × 5'}).correct,true);
});
test('multi-select accepts option numbers; ask accepts typed other answer',()=>{
 const multi={...call,arguments:{...call.arguments,multiSelect:true,options:[{label:'甲',value:'a'},{label:'乙',value:'b'},{label:'丙',value:'c'}],correctAnswer:['a','c']}};
 const p=pendingQuestionOf([{id:'m1',role:'assistant',content:[multi],timestamp:1,stopReason:'toolUse'}]);
 const shown=formFor(p).properties.answer.enum.slice(0,3);
 const numbers=['甲','丙'].map(x=>shown.indexOf(x)+1).join(',');
 assert.equal(answerFor(p,{answer:numbers}).correct,true);assert.throws(()=>answerFor(p,{answer:'1,9'}));
 const ask={type:'toolCall',id:'q2',name:'ask_user_question',arguments:{question:'想学哪个？',options:[{label:'A',value:'a',description:'说明 A'},{label:'B',value:'b'}]}};
 const q=pendingQuestionOf([{id:'m1',role:'assistant',content:[ask],timestamp:1,stopReason:'toolUse'}]);
 assert.match(formFor(q).properties.answer.description,/说明 A/);assert.equal(formFor(q).properties.answer.enum.includes('暂时不知道'),false);
 assert.equal(answerFor(q,{answer:'自己写的'}).other,'自己写的');
});
test('multi-select preserves numeric choice labels and still accepts typed ordinals',()=>{
 const multi={...call,arguments:{...call.arguments,multiSelect:true,options:[{label:'101',value:'a'},{label:'1,3',value:'b'},{label:'100',value:'c'}],correctAnswer:['a','b']}};
 const pending=pendingQuestionOf([{id:'m1',role:'assistant',content:[multi],timestamp:1,stopReason:'toolUse'}]);
 const choices=formFor(pending).properties.answer.enum;
 assert.deepEqual(answerFor(pending,{answer:choices.find(choice=>choice==='101')}).answers.map(answer=>answer.value),['a']);
 assert.deepEqual(answerFor(pending,{answer:'1,3'}).answers.map(answer=>answer.value),['b']);
 const ordinals=['101','1,3'].map(choice=>choices.indexOf(choice)+1).join('、');
 assert.equal(answerFor(pending,{answer:ordinals}).correct,true);
});
test('answered card, phase dividers, tool rows, plan statuses and handoff title follow the desktop view',()=>{
 const r=record();const p=pendingQuestionOf(r.messages);
 r.messages.push({id:'a1',role:'toolResult',toolName:'quiz',toolCallId:'q1',details:answerFor(p,{answer:'a',thinking:'猜的'}),content:[],timestamp:2});
 const card=visibleRows(r.messages).map(x=>x.text).join('\n');
 assert.match(card,/\*\*理解检查\*\* · ✗ 再想一想 · 把握 80%/);assert.match(card,/✗ \*\*100\*\*（你的选择）/);assert.match(card,/✓ 101（正确答案）/);
 assert.match(card,/<summary>查看解析<\/summary>/);assert.match(card,/你的想法：\*猜的/);
 const tool={id:'m0',role:'assistant',content:[{type:'toolCall',id:'t1',name:'research',arguments:{question:'ACP 是什么'}}],timestamp:0,stopReason:'toolUse'};
 assert.deepEqual(visibleRows([tool]).map(x=>[x.kind,x.title,x.status]),[['tool','资料检索：ACP 是什么','in_progress']]);
 const tree={nodes:[{id:'n1',title:'一'},{id:'n2',title:'二'},{id:'n3',title:'三'}],edges:[]};
 const tagged=id=>({id:'m'+id,role:'assistant',content:[{...call,id:'q'+id,arguments:{...call.arguments,nodeId:id}}],timestamp:1});
 assert.deepEqual(planEntries({tree,messages:[tagged('n1'),tagged('n2')]}).map(x=>x.status),['completed','in_progress','pending']);
 assert.equal(courseTitle({title:'Context handoff (delta)…',messages:[{role:'user',content:'Context handoff (x)\nstuff\n\nUser message:\n我想学习 acp'}]}),'我想学习 acp');
 assert.equal(learnerText([{type:'text',text:'Context handoff (delta)\nold\n\nUser message:\n我想学习 acp'}]),'我想学习 acp');
});
test('bridge emits native plan, title, tool card and commands once',async()=>{
 const r={...record(),title:'Context handoff (x)',tree:{nodes:[{id:'n1',title:'一'}],edges:[]}};
 r.messages.unshift({id:'u0',role:'user',content:'Context handoff (x)\n\nUser message:\n学 TCP',timestamp:0});
 r.messages[1].content[1]={...call,arguments:{...call.arguments,nodeId:'n1'}};
 r.messages.push({id:'m9',role:'assistant',content:[{type:'toolCall',id:'t9',name:'research',arguments:{question:'TCP'}}],timestamp:9});
 const out=[];const b=new Bridge({async json(){return structuredClone(r);}},m=>out.push(m));
 await b.handle('session/load',{sessionId:'chat_test'});const s=b.sessions.get('chat_test');b.render(r,s);
 const kinds=out.map(m=>m.params?.update?.sessionUpdate).filter(Boolean);
 assert.equal(kinds.filter(k=>k==='plan').length,1);assert.equal(kinds.filter(k=>k==='tool_call').length,1);assert.equal(kinds.filter(k=>k==='available_commands_update').length,1);
 assert.equal(out.find(m=>m.params?.update?.sessionUpdate==='session_info_update').params.update.title,'学 TCP');
 assert.deepEqual(out.find(m=>m.params?.update?.sessionUpdate==='plan').params.update.entries,[{content:'一',priority:'medium',status:'in_progress'}]);
});
test('T3 coding wrapper is removed but plain learner text is preserved',()=>{
 assert.equal(learnerText([{type:'text',text:'<t3_code_instructions>coding tools</t3_code_instructions>\n<user_request>继续</user_request>\n<runtime_info>host</runtime_info>'}]),'继续');
 assert.equal(learnerText([{type:'text',text:'解释 <user_request> 标签'}]),'解释 <user_request> 标签');
 assert.equal(learnerText([{type:'text',text:'/refresh\n<runtime_info>In case you\'re asked: you are running in T3 Code through acp</runtime_info>\n<pull_request_linking>\nLink each PR you create.\n</pull_request_linking>'}]),'/refresh');
});
test('model health probe creates no course; first message creates and resumes one persistent alias',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lh-acp-alias-'));let creates=0,posts=0;const r={id:'chat_created',messages:[],turnInFlight:false};
 const backend={async json(path,body){if(path==='/api/chats'&&body){creates++;return r;}if(path==='/api/chat'){posts++;assert.equal(body.chatId,'chat_created');return {};}if(path==='/api/chats')return {chats:[{...r,title:'主题',updatedAt:1}]};assert.equal(path,'/api/chats/chat_created');return r;}};
 try{
 const b=new Bridge(backend,()=>{},dir), n=await b.handle('session/new',{cwd:'/tmp'});assert.equal(creates,0);
 await b.handle('session/prompt',{sessionId:n.sessionId,prompt:[{type:'text',text:'主题'}]});assert.equal(creates,1);assert.equal(posts,1);
 const resumed=new Bridge(backend,()=>{},dir);await resumed.handle('session/load',{sessionId:n.sessionId});assert.equal(resumed.nativeId(n.sessionId),'chat_created');
 assert.equal((await resumed.handle('session/list',{})).sessions[0].sessionId,n.sessionId);
 assert.equal((await stat(join(dir,n.sessionId+'.json'))).mode&0o777,0o600);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('streaming messages without persisted ids survive multiple steps and do not repeat on settlement',async()=>{
 const user={id:'u1',role:'user',content:'问题',timestamp:10};
 const first={role:'assistant',content:[{type:'text',text:'第一段'}],timestamp:11};
 const second={role:'assistant',content:[{type:'text',text:'第二段'}],timestamp:12};
 let settled=false;const output=[];
 const backend={async json(){return {messages:settled?[user,{...first,id:'saved1'},{...second,id:'saved2'}]:[user],turnInFlight:!settled};},async stream(id,emit){for(const m of [first,second]){emit({type:'message_start',message:{...m,content:[]}});emit({type:'message_update',message:m});emit({type:'message_end',message:m});}settled=true;}};
 const b=new Bridge(backend,m=>output.push(m));const s={seen:new Map()};await b.follow('chat_test',s,new AbortController().signal);
 const text=output.map(m=>m.params?.update?.content?.text||'').join('');assert.equal(text.match(/第一段/g)?.length,1);assert.equal(text.match(/第二段/g)?.length,1);
});
test('visible history excludes pending correct answer and hidden reasoning',()=>{
 const r=record();r.messages[0].content.unshift({type:'thinking',thinking:'private reasoning'});
 assert.deepEqual(visibleRows(r.messages).map(x=>x.text),['先理解 SYN 的作用。']);
});
test('gateway has owner-only socket, forwards only learning routes and retains secret locally',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lh-acp-test-'));let headers;
 const server=http.createServer((req,res)=>{headers=req.headers;res.setHeader('content-type','application/json');res.end('{"chats":[]}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let gateway;
 try{gateway=await startACPBridge({directory:dir,origin:`http://127.0.0.1:${server.address().port}`,secret:'test-only-secret'});
 assert.equal((await stat(join(dir,'bridge.sock'))).mode&0o777,0o600);
 const backend=new Backend(join(dir,'bridge.sock'));assert.deepEqual(await backend.json('/api/chats'),{chats:[]});assert.equal(headers['x-learnharness-desktop'],'test-only-secret');
 for(const p of ['/api/settings','/api/chats/../settings','/api/chats/chat_x?bad=1'])await assert.rejects(backend.json(p));
 assert.equal(allowed('DELETE','/api/chats/chat_x'),false);
 }finally{gateway?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('ACP lists and loads existing course, submits all answer fields exactly once',async()=>{
 let r=record(),posts=0;const output=[];
 const backend={async json(path,body){if(path==='/api/chats')return {chats:[{id:r.id,title:r.title,updatedAt:1}]};if(path==='/api/chat'){posts++;assert.equal(body.input.answer.correct,true);assert.equal(body.input.answer.readingThinking,'阅读备注');r.messages.push({id:'a1',role:'toolResult',toolName:'quiz',toolCallId:'q1',details:body.input.answer,content:[],timestamp:2});return {ok:true};}return structuredClone(r);}};
 const b=new Bridge(backend,msg=>{output.push(msg);if(msg.method==='elicitation/create')queueMicrotask(()=>b.receive({jsonrpc:'2.0',id:msg.id,result:{action:'accept',content:{answer:'b',confidence:'90',thinking:'想法',readingThinking:'阅读备注'}}}));});
 await b.handle('initialize',{clientCapabilities:{elicitation:{form:{}}}});
 assert.equal((await b.handle('session/list',{})).sessions[0].sessionId,'chat_test');
 await b.handle('session/load',{sessionId:'chat_test'});
 const result=await b.handle('session/prompt',{sessionId:'chat_test',prompt:[{type:'text',text:'继续'}]});
 assert.equal(result.stopReason,'end_turn');assert.equal(posts,1);assert.equal(pendingQuestionOf(r.messages),null);
 assert.ok(output.some(m=>m.params?.update?.content?.text.includes('回答正确')));
});
test('desktop answer invalidates the waiting ACP question instead of resubmitting it',async()=>{
 let r=record(),posts=0;const out=[];const backend={async json(path,body){if(body)posts++;return structuredClone(r);}};
 const b=new Bridge(backend,m=>{out.push(m);if(m.method==='elicitation/create')setTimeout(()=>{r.messages.push({id:'a2',role:'toolResult',toolName:'quiz',toolCallId:'q1',details:answerFor(pendingQuestionOf(r.messages),{answer:'b'}),content:[],timestamp:3});},20);});
 await b.handle('initialize',{clientCapabilities:{elicitation:{form:{}}}});await b.handle('session/load',{sessionId:'chat_test'});
 await b.handle('session/prompt',{sessionId:'chat_test',prompt:[{type:'text',text:'继续'}]});
 assert.equal(posts,0);assert.ok(out.some(m=>m.method==='$/cancel_request'));
});
test('cancel waiting question preserves course; reopening can ask again',async()=>{
 const r=record();const b=new Bridge({async json(){return r;}},m=>{if(m.method==='elicitation/create')queueMicrotask(()=>b.handle('session/cancel',{sessionId:'chat_test'}));});
 await b.handle('initialize',{clientCapabilities:{elicitation:{form:{}}}});await b.handle('session/load',{sessionId:'chat_test'});
 assert.equal((await b.handle('session/prompt',{sessionId:'chat_test',prompt:[{type:'text',text:'继续'}]})).stopReason,'cancelled');
 assert.ok(pendingQuestionOf(r.messages));assert.equal(b.sessions.get('chat_test').controller,null);
});
test('one prompt continues through six questions, retrying invalid answers per question',async()=>{
 const r=record(),submitted=[],shown=[],output=[];const attempts=new Map();
 const backend={async json(path,body){
  if(path==='/api/chat'){
   assert.equal(body.input.type,'answer');
   const pending=pendingQuestionOf(r.messages);assert.equal(body.input.toolCallId,pending.toolCallId);
   submitted.push(pending.toolCallId);
   r.messages.push({id:`a${submitted.length}`,role:'toolResult',toolName:'quiz',toolCallId:pending.toolCallId,details:body.input.answer,content:[],timestamp:submitted.length*2});
   if(submitted.length<6)r.messages.push({id:`m${submitted.length+1}`,role:'assistant',content:[{type:'text',text:`讲解 ${submitted.length+1}`},{...call,id:`q${submitted.length+1}`}],timestamp:submitted.length*2+1,stopReason:'toolUse'});
   return {ok:true};
  }
  return structuredClone(r);
 }};
 const b=new Bridge(backend,m=>{
  output.push(m);if(m.method!=='elicitation/create')return;
  const id=pendingQuestionOf(r.messages).toolCallId;shown.push(id);const n=(attempts.get(id)||0)+1;attempts.set(id,n);
  queueMicrotask(()=>b.receive({jsonrpc:'2.0',id:m.id,result:{action:'accept',content:{answer:n===1?'invalid':'b'}}}));
 });
 await b.handle('initialize',{clientCapabilities:{elicitation:{form:{}}}});await b.handle('session/load',{sessionId:'chat_test'});output.length=0;
 const result=await b.handle('session/prompt',{sessionId:'chat_test',prompt:[{type:'text',text:'继续'}]});
 assert.deepEqual(submitted,['q1','q2','q3','q4','q5','q6']);assert.equal(shown.length,12);
 assert.equal(result.stopReason,'end_turn');assert.equal(pendingQuestionOf(r.messages),null);
 assert.equal(output.some(m=>m.params?.update?.content?.text.includes('发送“继续”')),false);
});
test('cancelling the automatically opened next question preserves it without submitting',async()=>{
 const r=record();let posts=0,forms=0;
 const backend={async json(path,body){
  if(body){posts++;r.messages.push({id:'a1',role:'toolResult',toolName:'quiz',toolCallId:'q1',details:body.input.answer,content:[],timestamp:2},{id:'m2',role:'assistant',content:[{...call,id:'q2'}],timestamp:3,stopReason:'toolUse'});return {ok:true};}
  return structuredClone(r);
 }};
 const b=new Bridge(backend,m=>{if(m.method==='elicitation/create'){forms++;queueMicrotask(()=>forms===1?b.receive({jsonrpc:'2.0',id:m.id,result:{action:'accept',content:{answer:'b'}}}):b.handle('session/cancel',{sessionId:'chat_test'}));}});
 await b.handle('initialize',{clientCapabilities:{elicitation:{form:{}}}});await b.handle('session/load',{sessionId:'chat_test'});
 const result=await b.handle('session/prompt',{sessionId:'chat_test',prompt:[{type:'text',text:'继续'}]});
 assert.equal(result.stopReason,'cancelled');assert.equal(forms,2);assert.equal(posts,1);
 assert.equal(pendingQuestionOf(r.messages).toolCallId,'q2');assert.equal(b.sessions.get('chat_test').controller,null);
});
