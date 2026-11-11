#!/usr/bin/env node
import http from 'node:http';
import readline from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { pendingQuestionOf, activeProblemOf, formFor, answerFor, visibleRows } from './core.mjs';

const aliasDir = process.env.LH_ACP_STATE_DIR || join(homedir(), 'Library/Application Support/LearnHarness Personal/acp/sessions');
const defaultSocket = join(homedir(), 'Library/Application Support/LearnHarness Personal/acp/bridge.sock');
export function learnerText(prompt) {
  const text=(prompt??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();
  // T3 wraps coding-agent instructions around user text. Learning runs have
  // their own tools and system prompt; keep only the actual learner request.
  const wrapped=text.match(/^<t3_code_instructions>[\s\S]*?<\/t3_code_instructions>\s*<user_request>\s*([\s\S]*?)\s*<\/user_request>(?=\s*(?:<runtime_info>|<pull_request_linking>|$))/);
  if(wrapped)return wrapped[1].trim();
  // Follow-up turns omit the outer wrapper but still append these host notes.
  return text
    .replace(/\s*<pull_request_linking>\s*Link each PR[\s\S]*?<\/pull_request_linking>\s*$/, '')
    .replace(/\s*<runtime_info>In case you're asked: you are running in T3 Code[\s\S]*?<\/runtime_info>\s*$/, '')
    .trim();
}
export class Backend {
  constructor(socketPath = process.env.LH_ACP_SOCKET || defaultSocket) { this.socketPath = socketPath; }
  async response(path, body, signal) {
    return new Promise((resolve, reject) => {
      const req = http.request({ socketPath:this.socketPath, path, method:body === undefined ? 'GET' : 'POST', headers:{'content-type':'application/json'}, signal }, resolve);
      req.on('error', error => reject(signal?.aborted ? error : new Error('无法连接 LearnHarness Personal，请先打开已安装的应用。')));
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async json(path, body, signal) {
    const res = await this.response(path, body, signal);
    res.setEncoding('utf8'); // Preserve multibyte characters across network chunks.
    let raw = ''; for await (const chunk of res) raw += chunk;
    const data = raw ? JSON.parse(raw) : {};
    if (res.statusCode >= 400) { const e=new Error(data.error || `LearnHarness HTTP ${res.statusCode}`); e.status=res.statusCode; throw e; }
    return data;
  }
  async stream(id, onEvent, signal) {
    const res = await this.response(`/api/chats/${id}/stream`, undefined, signal);
    if (res.statusCode !== 200) throw new Error(`学习流连接失败 (${res.statusCode})`);
    res.setEncoding('utf8');
    let buffer='';
    for await (const chunk of res) {
      buffer += chunk.toString();
      let end;
      while ((end=buffer.indexOf('\n\n')) >= 0) {
        const frame=buffer.slice(0,end); buffer=buffer.slice(end+2);
        const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');
        if (!data || data==='[DONE]') continue;
        onEvent(JSON.parse(data));
      }
    }
  }
}

export class Bridge {
  constructor(backend, write, stateDir=aliasDir) { this.backend=backend; this.write=write; this.aliasDir=stateDir; this.requests=new Map(); this.sessions=new Map(); this.ordinal=0; this.canForm=false; }
  notify(method, params) { this.write({jsonrpc:'2.0',method,params}); }
  say(id,text,role='assistant') { if(text) this.notify('session/update',{sessionId:id,update:{sessionUpdate:role==='user'?'user_message_chunk':'agent_message_chunk',content:{type:'text',text}}}); }
  ask(params, signal) {
    const id=`lh-${++this.ordinal}`;
    return new Promise((resolve,reject)=>{
      const abort=()=>{this.requests.delete(id);this.notify('$/cancel_request',{id});reject(new Error('cancelled'));};
      this.requests.set(id,{resolve:r=>{signal?.removeEventListener('abort',abort);resolve(r);},reject:e=>{signal?.removeEventListener('abort',abort);reject(e);}});
      signal?.addEventListener('abort',abort,{once:true});
      this.notifyRequest(id,'elicitation/create',params);
      if(signal?.aborted) abort();
    });
  }
  notifyRequest(id,method,params){this.write({jsonrpc:'2.0',id,method,params});}
  async receive(msg) {
    if (!msg.method) { const p=this.requests.get(msg.id); if(p){this.requests.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);} return; }
    try { const result=await this.handle(msg.method,msg.params??{}); if(msg.id!==undefined)this.write({jsonrpc:'2.0',id:msg.id,result}); }
    catch(e){if(msg.id!==undefined)this.write({jsonrpc:'2.0',id:msg.id,error:{code:e.code??-32000,message:e.message}});}
  }
  modelState(){return {models:{currentModelId:'learnharness-configured',availableModels:[{modelId:'learnharness-configured',name:'LearnHarness · 课程原有模型',description:'沿用课程配置；新课使用 LearnHarness 默认模型'}]}};}
  async getRecord(id,signal){const r=await this.backend.json(`/api/chats/${this.sessions.get(id)?.backendId||id}`,undefined,signal);return {...r,id};}
  nativeId(id){return this.sessions.get(id)?.backendId||id;}
  async handle(method,p) {
    if(method==='initialize') { this.canForm=p.clientCapabilities?.elicitation?.form!=null;return {protocolVersion:1,agentInfo:{name:'learnharness-personal',title:'LearnHarness 中文学习',version:'0.1.0'},agentCapabilities:{loadSession:true,sessionCapabilities:{list:{}},promptCapabilities:{}},authMethods:[]}; }
    if(method==='authenticate')return {};
    if(method==='session/list'){
      const {chats}=await this.backend.json('/api/chats');const aliases=new Map();
      for(const name of await fs.readdir(this.aliasDir).catch(()=>[])){if(!/^chat_acp_[a-f0-9-]+\.json$/.test(name))continue;try{const v=JSON.parse(await fs.readFile(join(this.aliasDir,name),'utf8'));aliases.set(v.backendId,name.slice(0,-5));}catch{}}
      return {sessions:chats.map(c=>({sessionId:aliases.get(c.id)||c.id,cwd:p.cwd||process.cwd(),title:c.title,updatedAt:typeof c.updatedAt==='number'?new Date(c.updatedAt).toISOString():c.updatedAt}))};
    }
    if(method==='session/new'){const id='chat_acp_'+randomUUID();this.sessions.set(id,{seen:new Map(),cwd:p.cwd,backendId:null});return {sessionId:id,...this.modelState()};}
    if(method==='session/load'){
      this.validateId(p.sessionId);let backendId=p.sessionId;
      if(p.sessionId.startsWith('chat_acp_')){const alias=JSON.parse(await fs.readFile(join(this.aliasDir,p.sessionId+'.json'),'utf8'));backendId=alias.backendId;this.validateId(backendId);}
      const s={seen:new Map(),cwd:p.cwd,backendId};this.sessions.set(p.sessionId,s);const r=await this.getRecord(p.sessionId);this.render(r,s,true);
      this.say(p.sessionId,'\n\n已连接同一节 LearnHarness 课程。发送“继续”显示待答题，或发送 /refresh 刷新。\n');return this.modelState();
    }
    if(method==='session/set_model'){if(p.modelId!=='learnharness-configured')throw new Error('模型由 LearnHarness 课程设置管理');return {};}
    if(method==='session/cancel'){this.sessions.get(p.sessionId)?.controller?.abort();return {};}
    if(method==='session/prompt')return this.prompt(p);
    const e=new Error(`Unsupported method: ${method}`);e.code=-32601;throw e;
  }
  validateId(id){if(typeof id!=='string'||!/^chat_[a-zA-Z0-9_-]+$/.test(id))throw new Error('无效的课程标识');}
  render(record,s,includeUser=false){
    // Wire messages have no persisted id yet. Timestamp survives settlement.
    const messages=(record.messages??[]).map(m=>({...m,id:typeof m.timestamp==='number'?`acp_${m.role}_${m.timestamp}`:m.id}));
    for(const row of visibleRows(messages)){
      const old=s.seen.get(row.id)||'';
      if(row.text!==old && (includeUser || row.role!=='user'))this.say(record.id, row.text.startsWith(old)?row.text.slice(old.length)+(old?'':'\n\n'):row.text+'\n\n',row.role);
      s.seen.set(row.id,row.text);
    }
  }
  async follow(id,s,signal){
    const r=await this.getRecord(id,signal);this.render(r,s);
    if(!r.turnInFlight)return r;
    const work=[...r.messages];
    await this.backend.stream(this.nativeId(id),e=>{
      if(e.type==='error')throw new Error(e.errorText||'生成失败');
      if(e.message?.role==='assistant' && ['message_start','message_update','message_end'].includes(e.type)){
        const m=e.message;const at=work.findIndex(x=>m.id ? x.id===m.id : x.role===m.role && x.timestamp===m.timestamp);if(at>=0)work[at]=m;else work.push(m);
        this.render({...r,messages:work},s);
      }
    },signal);
    const final=await this.getRecord(id,signal);this.render(final,s);
    if(final.turnError)throw new Error(typeof final.turnError==='string'?final.turnError:'LearnHarness 本轮生成失败，请在桌面查看详情');
    return final;
  }
  async collect(id,pending,signal){
    if(!this.canForm)throw new Error('当前 T3 版本未声明支持 ACP 提问表单，请升级 T3；原课程仍可在 LearnHarness 中继续。');
    const local=new AbortController();const abort=()=>local.abort();signal.addEventListener('abort',abort,{once:true});
    let changed=false,checking=false;
    const timer=setInterval(async()=>{
      if(checking)return;checking=true;
      try{const r=await this.getRecord(id,local.signal);if(pendingQuestionOf(r.messages)?.key!==pending.key){changed=true;local.abort();}}catch{}finally{checking=false;}
    },1500);
    try{return await this.ask({sessionId:id,mode:'form',message:pending.input.question,requestedSchema:formFor(pending)},local.signal);}
    catch(e){if(changed)return {action:'changed'};throw e;}
    finally{clearInterval(timer);signal.removeEventListener('abort',abort);local.abort();}
  }
  async prompt(p){
    const id=p.sessionId;this.validateId(id);
    const s=this.sessions.get(id);if(!s)throw new Error('请先恢复或新建课程');
    if(s.controller)throw new Error('本课程已有请求在进行');
    const controller=new AbortController();s.controller=controller;const signal=controller.signal;
    try{
      const text=learnerText(p.prompt);
      if((p.prompt??[]).some(x=>x.type!=='text'))throw new Error('当前接入只支持文字；资料附件请在 LearnHarness 中添加。');
      if(s.backendId===null){
        if(!text)throw new Error('请输入学习主题');
        const created=await this.backend.json('/api/chats',{title:text.slice(0,100)});s.backendId=created.id;
        await fs.mkdir(this.aliasDir,{recursive:true,mode:0o700});await fs.writeFile(join(this.aliasDir,id+'.json'),JSON.stringify({backendId:created.id,cwd:s.cwd}),{mode:0o600,flag:'wx'});
      }
      let r=await this.follow(id,s,signal);
      if(text==='/refresh'){this.say(id,'\n已同步最新课程记录。\n');return {stopReason:'end_turn'};}
      if(!pendingQuestionOf(r.messages)){
        const problem=activeProblemOf(r.messages);
        if(!text)throw new Error('请输入学习主题或回答');
        const input=problem?{type:'thinking',problemCallId:problem.toolCallId,text}:text==='/retry'?{type:'retry'}:{type:'text',text};
        await this.backend.json('/api/chat',{chatId:this.nativeId(id),input},signal);
        r=await this.follow(id,s,signal);
      }else if(text && !['继续','continue','/continue'].includes(text)){this.say(id,'\n当前课程有待答题，请在下面表单作答；刚才的文字尚未作为答案提交。\n');}
      // Keep the lesson open across questions; only invalid input is retry-limited.
      let invalidAttempts=0;
      while(true){
        signal.throwIfAborted();
        const pending=pendingQuestionOf(r.messages);if(!pending)break;
        const response=await this.collect(id,pending,signal);
        if(response.action==='changed'){invalidAttempts=0;this.say(id,'\n这道题已在另一端处理，正在同步。\n');r=await this.follow(id,s,signal);continue;}
        if(response.action!=='accept'){this.say(id,'\n未提交答案，课程仍停留在这道题。发送“继续”可再次作答。\n');break;}
        let answer;
        try{answer=answerFor(pending,response.content);}catch(e){
          if(++invalidAttempts>=4){this.say(id,`\n${e.message}。多次提交无效，已暂停；题目已保留，发送“继续”可重新作答。\n`);break;}
          this.say(id,`\n${e.message}，请重新填写。\n`);continue;
        }
        const current=await this.getRecord(id,signal);
        if(pendingQuestionOf(current.messages)?.key!==pending.key){invalidAttempts=0;r=await this.follow(id,s,signal);continue;}
        // Server re-checks dangling toolCallId under its turn claim: no duplicate answers.
        await this.backend.json('/api/chat',{chatId:this.nativeId(id),input:{type:'answer',toolCallId:pending.toolCallId,answer}},signal);
        invalidAttempts=0;r=await this.follow(id,s,signal);
      }
      return {stopReason:'end_turn'};
    }catch(e){if(signal.aborted){this.say(id,'\n已停止此端等待，未提交的题目会保留；Mac 已开始的生成可在 LearnHarness 中停止。\n');return {stopReason:'cancelled'};}throw e;}
    finally{s.controller=null;}
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const bridge=new Bridge(new Backend(),msg=>process.stdout.write(JSON.stringify(msg)+'\n'));
  const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  input.on('line',line=>{try{void bridge.receive(JSON.parse(line));}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}})+'\n');}});
  input.on('close',()=>{for(const s of bridge.sessions.values())s.controller?.abort();});
}
