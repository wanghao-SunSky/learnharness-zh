import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

// Only use with the disposable data copy. /api/chat is intercepted: no model call.
assert.ok(process.env.LH_PREVIEW_CHAT_ID, 'Set LH_PREVIEW_CHAT_ID to a disposable test course');
const origin = process.env.LH_PREVIEW_URL ?? 'http://127.0.0.1:32179';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
 const page = await browser.newPage();
 const errors = [];
 let submitted;
 page.on('pageerror', e => errors.push(e.message));
 await page.setRequestInterception(true);
 page.on('request', r => {
  if (r.url() === origin + '/api/chat' && r.method() === 'POST') {
   submitted = JSON.parse(r.postData());
   return r.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({error:'界面测试：未发送模型请求'}) });
  }
  return r.continue();
 });
 await page.setViewport({width:1440,height:1000});
 await page.goto(origin + '/chat/' + process.env.LH_PREVIEW_CHAT_ID, {waitUntil:'networkidle2'});
 await page.waitForSelector('.lh-inline-exercise [role="radio"]');
 await page.evaluate(() => localStorage.setItem('lh:sidebar-open','1'));
 await page.reload({waitUntil:'networkidle2'});
 await page.waitForSelector('.lh-inline-exercise');
 const choose = '[data-testid="question-dock"] [role="radio"]';
 await page.click(choose);
 const reasoning = '[aria-label="你的解题思路"][contenteditable]';
 const notes = '[data-testid="reading-thinking-field"] [contenteditable]';
 await page.click(reasoning); await page.keyboard.type('测试思路：确认号等于对方序号加一。');
 await page.click('.lh-reading-disclosure summary');
 await page.click(notes); await page.keyboard.type('测试随想：双方分别维护序号。');
 const selected = await page.$eval(choose, e => e.textContent);
 await page.setViewport({width:850,height:760});
 await page.waitForSelector('.lh-inline-exercise');
 const reveal = await page.$('[data-testid="teach-check-reveal"], [data-testid="question-dock-bar"]');
 if (reveal) await reveal.click();
 await page.waitForFunction(() => document.querySelector('[aria-label="你的解题思路"]')?.getBoundingClientRect().height > 0);
 assert.equal(await page.$eval(notes,e=>e.textContent), '测试随想：双方分别维护序号。');
 assert.equal(await page.$eval(reasoning,e=>e.textContent), '测试思路：确认号等于对方序号加一。');
 assert.equal(await page.$eval('[role="radio"][aria-checked="true"]',e=>e.textContent),selected);
 await page.setViewport({width:1440,height:700});
 await page.waitForSelector('.lh-inline-exercise');
 const geometry = await page.evaluate(() => {
  const dock=document.querySelector('.lh-inline-exercise');
  const target=document.querySelector('.lh-exercise-target');
  const options=document.querySelector('.lh-exercise-options').getBoundingClientRect();
  const response=document.querySelector('.lh-exercise-response').getBoundingClientRect();
  return {inline:target.contains(dock),position:getComputedStyle(dock).position,optionsRight:options.right,responseLeft:response.left,overflow:document.documentElement.scrollWidth>innerWidth};
 });
 assert.ok(geometry.inline);
 assert.equal(geometry.position,'static');
 assert.ok(geometry.optionsRight <= geometry.responseLeft);
 assert.equal(geometry.overflow,false);
 await page.setViewport({width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('lh:sidebar-open','0'));
 // Resizing must preserve the mounted question and all three answer parts.
 assert.equal(await page.$eval(reasoning,e=>e.textContent), '测试思路：确认号等于对方序号加一。');
 assert.equal(await page.$eval(notes,e=>e.textContent), '测试随想：双方分别维护序号。');
 const mobile=await page.evaluate(()=>{
  const a=document.querySelector('.lh-exercise-options').getBoundingClientRect();
  const b=document.querySelector('.lh-exercise-response').getBoundingClientRect();
  return {stacked:b.top>=a.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
 });
 assert.ok(mobile.stacked);
 assert.equal(mobile.overflow,false);
 await page.click('[data-testid="question-dock"] button[type="submit"]');
 for(let i=0;i<30 && !submitted;i++) await new Promise(r=>setTimeout(r,100));
 assert.ok(submitted,'answer request intercepted');
 assert.match(JSON.stringify(submitted), /测试思路：确认号等于对方序号加一/);
 assert.match(JSON.stringify(submitted), /测试随想：双方分别维护序号/);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({resizeDrafts:true,inlineExercise:true,geometry,mobile,submittedInputType:submitted.input.type,combinedAnswer:true,modelRequests:0,errors},null,2));
} finally {await browser.close();}
