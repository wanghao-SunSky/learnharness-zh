// Reuse LearnHarness's exact question parsing, option shuffle and grading.
import { pendingQuestionOf, activeProblemOf } from '../src/core/native-messages.ts';
import { projectView } from '../src/core/view.ts';
import { buildAnswer, normalizeOptions, normalizeQuizType, seededRandom, shuffleOptions, resolveCorrect } from '../src/core/question-core.ts';
import { toolQuestionKind } from '../src/core/pending.ts';
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
export function formFor(p: any) {
  const q = questionData(p);
  const properties: any = {};
  if (q.mode === 'text') properties.answer = {type:'string',title:'你的回答',description:q.question};
  else {
    // T3 0.1.7 supports enum but not JSON Schema oneOf titles.
    const choices = [...q.options.map((o:any,i:number)=>`${i+1}. ${o.label}`), '暂时不知道'];
    properties.answer = q.mode === 'multi-select' ? {type:'array',title:'选择答案（可多选）',description:q.question,items:{type:'string',enum:choices},minItems:1} : {type:'string',title:'选择答案',description:q.question,enum:choices};
  }
  // T3 renders optional properties as extra steps. Use the learner's default
  // confidence in answerFor and omit the optional thought fields here.
  return {type:'object',properties,required:['answer']};
}
export function answerFor(p:any, content:any) {
  const q = questionData(p), c = {...content};
  for (const key of ['thinking','readingThinking']) if(c[key]==='跳过（不填写）') delete c[key];
  const values: any[] = (Array.isArray(c.answer) ? c.answer : [c.answer]).map((v:any)=>{
    if(q.mode==='text')return v;
    if(v==='暂时不知道')return '__lh_dont_know__';
    const at=q.options.findIndex((o:any,i:number)=>`${i+1}. ${o.label}`===v);
    return at>=0?q.options[at].value:v;
  });
  const dontKnow = q.mode !== 'text' && values.includes('__lh_dont_know__');
  if (q.mode === 'text' ? typeof c.answer !== 'string' || !c.answer.trim() : !values.length || values.some(v=>!q.options.some((o:any)=>o.value===v) && v!=='__lh_dont_know__')) throw new Error('请提供有效答案');
  if (dontKnow && values.length !== 1) throw new Error('暂时不知道不能与其他答案同时选择');
  if (q.mode === 'single-select' && values.length !== 1) throw new Error('这是一道单选题');
  const confidence = c.confidence === undefined || c.confidence === '' ? 80 : Number(c.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error('把握程度必须在 0–100 之间');
  for (const key of ['thinking','readingThinking']) if (c[key] !== undefined && typeof c[key] !== 'string') throw new Error('思路必须为文字');
  return buildAnswer(q, { dontKnow, values:q.mode === 'text' ? [] : values, text:q.mode === 'text' ? c.answer : undefined, thinking:c.thinking, readingThinking:c.readingThinking, confidence }, p.tool);
}
export function visibleRows(messages:any[]) {
  return projectView(messages).flatMap(m=>m.parts.flatMap((p:any,index:number)=>{
    let text = '';
    if (p.type === 'text') text = p.text ?? '';
    else if (p.output?.questionText) { const a=p.output; text=`**${a.questionText}**\n\n${a.dontKnow?'暂时不知道':(a.answers??[]).map((v:any)=>v.label).join('；') || a.text || a.other || ''}${typeof a.correct==='boolean'?'\n\n'+(a.correct?'回答正确':'需要再想一想'):''}${a.thinking?'\n\n思路：'+a.thinking:''}${a.readingThinking?'\n\n阅读随想：'+a.readingThinking:''}${a.explanation?'\n\n解析：'+a.explanation:''}`; }
    else if (p.type === 'tool-problem' && p.input?.statement) text=p.input.statement;
    else if (p.type === 'data-plan-block') { const nodes=p.data?.nodes ?? p.data?.tree?.nodes; if (Array.isArray(nodes)) text='**学习计划**\n'+nodes.map((n:any)=>'- '+(n.label??n.title??n.id)).join('\n'); }
    return text ? [{id:`${m.id}:${index}`,role:m.role,text}] : [];
  }));
}
