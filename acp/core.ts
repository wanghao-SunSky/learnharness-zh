// Reuse LearnHarness's exact question parsing, option shuffle and grading.
import { pendingQuestionOf, activeProblemOf } from '../src/core/native-messages.ts';
import { projectView } from '../src/core/view.ts';
import { buildAnswer, normalizeOptions, normalizeQuizType, seededRandom, shuffleOptions, resolveCorrect } from '../src/core/question-core.ts';
import { toolQuestionKind } from '../src/core/pending.ts';
import { answerForPresentation } from '../src/core/answer-presentation.ts';
import { derivePlanStatusesLh } from '../src/core/contracts/plan.ts';
import { phaseTimeline, teachStepIndex } from '../src/core/phases.ts';
import { repairMathForDisplay } from '../src/core/math-delims.ts';
export { pendingQuestionOf, activeProblemOf };
export function questionData(p: any) {
  const i = p.input, kind = toolQuestionKind(p.tool);
  const options = normalizeOptions(i.options ?? []);
  const ordered = kind === 'quiz' ? shuffleOptions(options, seededRandom(p.toolCallId)) : options;
  const q: any = { id:p.toolCallId, kind, question:i.question, context:i.details, options:ordered,
    mode:kind === 'explain' || !ordered.length ? 'text' : i.multiSelect ? 'multi-select' : 'single-select',
    createdAt:new Date().toISOString(), questionType:normalizeQuizType(i.type) };
  if (kind === 'quiz') { const resolved = resolveCorrect(i.correctAnswer, ordered); if (resolved.error) throw new Error(resolved.error); q.correctIndices = resolved.indices; q.explanation = i.explanation; }
  if (kind === 'explain') q.committedAnswer = i.correctAnswer;
  return q;
}
const QUESTION_PARTS = new Set(['tool-quiz','tool-probe','tool-ask_user_question','tool-explain','tool-recall']);
const DONT_KNOW = '暂时不知道';
// T3 renders enum choices as plain text even when math rendering is on.
export function plainMath(text:string) {
  const symbols:Record<string,string> = {times:'×',cdot:'·',div:'÷',le:'≤',leq:'≤',ge:'≥',geq:'≥',neq:'≠',ne:'≠',approx:'≈',pm:'±',to:'→',rightarrow:'→',leftarrow:'←',leftrightarrow:'↔',Rightarrow:'⇒',infty:'∞',in:'∈',sum:'∑',sqrt:'√',alpha:'α',beta:'β',gamma:'γ',delta:'δ',Delta:'Δ',theta:'θ',lambda:'λ',mu:'μ',pi:'π',sigma:'σ',omega:'ω',ldots:'…',dots:'…'};
  return text.replace(/\$\$?([^$]+?)\$\$?/g,(_,body:string)=>body
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g,'$1')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,'$1/$2')
    .replace(/\\([A-Za-z]+)/g,(m,name:string)=>symbols[name] ?? m)
    .replace(/\\([%{}_&#$])/g,'$1')
    .replace(/\s*([×·÷≤≥≠≈±→←↔⇒])\s*/g,' $1 ').replace(/\s+/g,' ').trim());
}
function questionLabel(tool:string, kind:string, type?:string) {
  if (tool === 'probe') return '了解基础';
  if (tool === 'recall') return '回忆练习';
  if (kind === 'quiz') return type === 'predict' ? '先做预测' : '理解检查';
  return kind === 'explain' ? '用自己的话解释' : '问题';
}
function choiceLabels(q:any) {
  const plain = q.options.map((o:any)=>plainMath(o.label));
  const all = [...plain, ...(q.kind === 'quiz' ? [DONT_KNOW] : [])];
  // Labels are the submitted values; number them only when needed to keep them distinct.
  const unique = new Set(all).size === all.length && all.every((x:string)=>x.length > 0);
  return unique ? plain : plain.map((x:string,i:number)=>`${i+1}. ${x}`);
}
export function formFor(p: any, tree?: any) {
  const q = questionData(p);
  const node = tree?.nodes?.find((n:any)=>n.id === p.input?.nodeId)?.title;
  const title = [questionLabel(p.tool, q.kind, q.questionType), node].filter(Boolean).join(' · ');
  const notes = [repairMathForDisplay(q.question)];
  if (q.context) notes.push(repairMathForDisplay(q.context));
  if (q.kind === 'ask' && q.options.some((o:any)=>o.description)) notes.push(q.options.map((o:any)=>`- **${o.label}**${o.description?'：'+o.description:''}`).join('\n'));
  const properties: any = {};
  if (q.mode === 'text') properties.answer = {type:'string',title,description:notes.join('\n\n')};
  else {
    const labels = choiceLabels(q);
    // T3 0.1.7 maps only top-level string enums to choices, so multi-select
    // accepts one choice or typed option numbers in its custom-answer field.
    if (q.mode === 'multi-select') notes.push('可多选：在下方输入框填写选项序号，例如 `1,3`。\n\n'+labels.map((x:string,i:number)=>`${i+1}. ${x}`).join('\n'));
    properties.answer = {type:'string',title,description:notes.join('\n\n'),enum:[...labels, ...(q.kind === 'quiz' ? [DONT_KNOW] : [])]};
  }
  // T3 renders optional properties as extra steps. Use the learner's default
  // confidence in answerFor and omit the optional thought fields here.
  return {type:'object',properties,required:['answer']};
}
export function answerFor(p:any, content:any) {
  const q = questionData(p), c = {...content};
  for (const key of ['thinking','readingThinking']) if(c[key]==='跳过（不填写）') delete c[key];
  const labels = q.mode === 'text' ? [] : choiceLabels(q);
  let raw = Array.isArray(c.answer) ? c.answer : [c.answer];
  const first = raw[0];
  if (q.mode === 'multi-select' && raw.length === 1 && typeof first === 'string' && !labels.includes(first) && /^\s*\d+(?:\s*[,，、\s]\s*\d+)*\s*$/.test(first)) {
    const indices = [...new Set(first.trim().split(/[,，、\s]+/).map(Number))];
    if (indices.some(index=>index < 1 || index > labels.length)) throw new Error('请提供有效答案');
    raw = indices.map(index=>labels[index-1]);
  }
  let other:string|undefined;
  const values = raw.map((v:any)=>{
    if(q.mode==='text')return v;
    if(v===DONT_KNOW)return '__lh_dont_know__';
    const at=labels.findIndex((label:string)=>label===v);
    if(at>=0)return q.options[at].value;
    if(q.kind==='ask' && typeof v==='string' && v.trim() && !q.options.some((o:any)=>o.value===v)){other=v.trim();return null;}
    return v;
  }).filter((v:any)=>v!==null);
  const dontKnow = q.mode !== 'text' && values.includes('__lh_dont_know__');
  if (q.mode === 'text' ? typeof c.answer !== 'string' || !c.answer.trim() : (!values.length && !other) || values.some((v:any)=>!q.options.some((o:any)=>o.value===v) && v!=='__lh_dont_know__')) throw new Error('请提供有效答案');
  if (dontKnow && values.length !== 1) throw new Error('暂时不知道不能与其他答案同时选择');
  if (q.mode === 'single-select' && values.length + (other ? 1 : 0) !== 1) throw new Error('这是一道单选题');
  const confidence = c.confidence === undefined || c.confidence === '' ? 80 : Number(c.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error('把握程度必须在 0–100 之间');
  for (const key of ['thinking','readingThinking']) if (c[key] !== undefined && typeof c[key] !== 'string') throw new Error('思路必须为文字');
  return buildAnswer(q, { dontKnow, values:q.mode === 'text' ? [] : values, other, text:q.mode === 'text' ? c.answer : undefined, thinking:c.thinking, readingThinking:c.readingThinking, confidence }, p.tool);
}
const quote = (text:string) => text.split('\n').map(line=>line ? `> ${line}` : '>').join('\n');
export function answeredCard(saved:any, input:any) {
  const a = answerForPresentation(saved, input);
  if (a.dismissed) return `> ${repairMathForDisplay(a.questionText)} — 已跳过`;
  const quiz = a.kind === 'quiz', selected = new Set((a.answers ?? []).map((x:any)=>x.index)), key = new Set(a.correctIndices ?? []);
  const status = !quiz ? '' : a.dontKnow ? '暂时不知道' : a.correct ? '✓ 回答正确' : '✗ 再想一想';
  const head = [`**${questionLabel(a.tool ?? '', a.kind, a.questionType)}**`, status, quiz && a.confidence != null ? `把握 ${a.confidence}%` : ''].filter(Boolean).join(' · ');
  const body = [head, repairMathForDisplay(a.questionText)];
  const details = input?.details;
  if (typeof details === 'string' && details.trim()) body.push(repairMathForDisplay(details));
  const rows = (a.options ?? []).map((o:any)=>{
    const label = repairMathForDisplay(o.label), sel = selected.has(o.index), right = quiz && key.has(o.index);
    if (!quiz) return sel ? `- ● **${label}**` : `- ○ ${label}`;
    if (sel && right) return `- ✓ **${label}**（你的选择）`;
    if (sel) return `- ✗ **${label}**（你的选择）`;
    if (right) return `- ✓ ${label}（正确答案）`;
    return `- ◦ ${label}`;
  });
  if (a.other) rows.push(`- ● **“${a.other}”**`);
  if (rows.length) body.push(rows.join('\n'));
  if (a.text) body.push(`“${a.text}”`);
  const out = [];
  if (a.readingThinking) out.push(`*阅读时的想法：*${a.readingThinking}`);
  out.push(quote(body.join('\n\n')));
  if (a.thinking ?? a.note) out.push(`*你的想法：*${a.thinking ?? a.note}`);
  if (quiz && a.explanation) out.push(`<details>\n<summary>查看解析</summary>\n\n${repairMathForDisplay(a.explanation)}\n\n</details>`);
  if (a.kind === 'explain' && a.committed) out.push(`**参考答案：**${repairMathForDisplay(a.committed)}`);
  return out.join('\n\n');
}
const TOOL_TITLES:Record<string,[string,string]> = {
  research:['资料检索','search'], pdf:['读取 PDF 资料','read'], demo:['交互演示（在 Mac 上查看）','other'], visual:['生成图示（在 Mac 上查看）','other'],
  show_image:['展示图片（在 Mac 上查看）','other'], web_search:['网页搜索','search'], web_fetch:['读取网页','fetch'], web_fetch_pdf:['下载 PDF','fetch'],
  pdf_info:['查阅 PDF','read'], pdf_extract:['查阅 PDF','read'], pdf_search:['搜索 PDF','search'], list_sessions:['查看学习记录','read'],
  list_propositions:['查看已学知识点','read'], find_candidates:['查找相关知识点','search'], read:['读取文件','read'], ls:['查看目录','read'], find:['查找文件','search'], grep:['搜索文件内容','search'],
};
function toolRow(p:any, id:string) {
  const name = p.type.slice('tool-'.length), known = TOOL_TITLES[name];
  if (!known) return null;
  const i = p.input ?? {};
  const subject = [i.question, i.query, i.title, i.caption, i.url, i.path, i.pattern].find(x=>typeof x === 'string' && x.trim());
  const title = subject ? `${known[0]}：${subject.trim().replace(/\s+/g,' ').slice(0,80)}` : known[0];
  const status = p.state === 'output-available' ? 'completed' : p.state === 'output-error' ? 'failed' : 'in_progress';
  return {id, kind:'tool', role:'assistant', title, toolKind:known[1], status};
}
function divider(id:string, label:string) { return {id, role:'assistant', text:`---\n\n**${label}**`}; }
export function visibleRows(messages:any[]) {
  const view = projectView(messages), phases = phaseTimeline(view);
  return view.flatMap((m:any,mi:number)=>{
    if (m.role === 'user' && m.parts.some((p:any)=>p.type === 'data-probe-handoff')) return [divider(`${m.id}:phase-plan`,'制定计划')];
    const artifact = m.role === 'user' && m.parts.find((p:any)=>p.type === 'data-subagent-artifact');
    if (artifact) {
      const brief = artifact.data?.result?.brief;
      return typeof brief === 'string' && brief.trim() ? [{id:`${m.id}:artifact`,role:'assistant',text:`<details>\n<summary>资料检索结果</summary>\n\n${brief.trim()}\n\n</details>`}] : [];
    }
    const seam = m.role === 'assistant' && mi > 0 && phases[mi] === 'teach' && phases[mi-1] !== 'teach' ? teachStepIndex(m.parts) : null;
    const rows:any[] = [];
    if (seam === -1) rows.push(divider(`${m.id}:phase-teach`,'讲解'));
    m.parts.forEach((p:any,index:number)=>{
      if (seam === index) rows.push(divider(`${m.id}:phase-teach`,'讲解'));
      const id = `${m.id}:${index}`;
      let text = '';
      if (p.type === 'text') text = m.role === 'user' ? handoffRequest(p.text ?? '') : p.text ?? '';
      else if (QUESTION_PARTS.has(p.type)) { if (p.state === 'output-available' && p.output?.questionText) text = answeredCard(p.output, p.input); }
      else if (p.type === 'tool-probe_done' && p.state === 'output-available') {
        const strands = p.input?.assessment?.strands;
        if (Array.isArray(strands)) text = '**摸底结论**\n\n'+strands.map((s:any)=>`- **${s.strand}**：${String(s.assessment ?? '').replace(/\n+/g,'；')}`).join('\n');
      }
      else if (p.type === 'tool-problem' && p.input?.statement) text = repairMathForDisplay(p.input.statement);
      else if (p.type === 'data-plan-block') { const nodes=p.data?.nodes ?? p.data?.tree?.nodes; if (Array.isArray(nodes)) text=`**学习计划** · ${nodes.length} 个节点\n\n`+nodes.map((n:any,i:number)=>`${i+1}. ${n.label??n.title??n.id}`).join('\n'); }
      else if (p.type?.startsWith('tool-')) { const row = toolRow(p, id); if (row) rows.push(row); return; }
      if (text) rows.push({id,role:m.role,text});
    });
    return rows;
  });
}
export function planEntries(record:any) {
  const tree = record?.tree;
  if (!Array.isArray(tree?.nodes) || !tree.nodes.length) return null;
  const statuses = derivePlanStatusesLh({nodes:tree.nodes, edges:tree.edges ?? [], version:tree.version ?? 0}, record.messages ?? []);
  return tree.nodes.map((n:any)=>({content:n.title ?? n.id, priority:'medium', status:statuses.current === n.id ? 'in_progress' : statuses.visited.has(n.id) ? 'completed' : 'pending'}));
}
// T3 provider handoffs wrap the learner's first message in replay context.
export function handoffRequest(text:string) {
  if (!/^Context handoff \(/.test(text)) return text;
  const at = text.lastIndexOf('\nUser message:\n');
  return at >= 0 ? text.slice(at + '\nUser message:\n'.length).trim() : text;
}
export function courseTitle(record:any) {
  const title = typeof record?.title === 'string' ? record.title.trim() : '';
  if (!title.startsWith('Context handoff')) return title;
  const first = (record.messages ?? []).find((m:any)=>m.role === 'user');
  const text = typeof first?.content === 'string' ? first.content : (first?.content ?? []).map((c:any)=>c.text ?? '').join('');
  return handoffRequest(text).slice(0,100);
}
