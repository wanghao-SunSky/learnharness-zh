import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
assert.ok(process.env.LH_PREVIEW_CHAT_ID, 'Set LH_PREVIEW_CHAT_ID to a disposable test course');
const origin=process.env.LH_PREVIEW_URL ?? 'http://127.0.0.1:32179';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1440,height:900});
 await page.goto(origin+'/chat/' + process.env.LH_PREVIEW_CHAT_ID,{waitUntil:'networkidle2'});
 await page.waitForSelector('[data-testid="plan-block-full"] svg');
 const nodes=await page.$$eval('[data-testid="plan-block-full"] g[data-testid^="plan-node-"]',nodes=>nodes.map(node=>{
  const rect=node.querySelector('rect'); const bounds=rect.getBBox();
  return {id:node.dataset.testid,stroke:getComputedStyle(rect).stroke, width:bounds.width,overflow:[...node.querySelectorAll('text')].filter(text=>{
   const b=text.getBBox();return b.x < 0 || b.x+b.width > bounds.width;
  }).map(text=>text.textContent)};
 }));
 assert.ok(nodes.length>0);
 assert.ok(nodes.every(n=>n.overflow.length===0),JSON.stringify(nodes));
 assert.ok(nodes.every(n=>!['rgb(255, 255, 255)','none'].includes(n.stroke)));
 await page.$eval('[data-testid="plan-block-full"]',e=>e.scrollIntoView({block:'end'}));
 await page.screenshot({path:'/tmp/learnharness-personal-review/desktop-plan.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({nodes:nodes.length,allLabelsFit:true,visibleBorders:true,errors}));
} finally {await browser.close();}
