import { chromium } from 'playwright';
import { marked } from 'marked';
import fs from 'fs';
import os from 'os';
import path from 'path';

function nowStr(){ const d=new Date(); const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`; }

const STATE_PATH=process.env.STATE_PATH;
const START_URL=process.env.START_URL||'https://editor.note.com/new';
const rawTitle=process.env.TITLE||'';
const rawFinal=JSON.parse(fs.readFileSync('final.json','utf8'));
const rawBody=String(rawFinal.body||'');
const TAGS=process.env.TAGS||'';
const IS_PUBLIC=String(process.env.IS_PUBLIC||'false')==='true';

if(!fs.existsSync(STATE_PATH)){ console.error('storageState not found:', STATE_PATH); process.exit(1); }

const ssDir=path.join(os.tmpdir(),'note-screenshots'); fs.mkdirSync(ssDir,{recursive:true}); const SS_PATH=path.join(ssDir,`note-post-${nowStr()}.png`);

function sanitizeTitle(t){
  let s=String(t||'').trim();
  s=s.replace(/^```[a-zA-Z0-9_-]*\s*$/,'').replace(/^```$/,'');
  s=s.replace(/^#+\s*/,'');
  s=s.replace(/^"+|"+$/g,'').replace(/^'+|'+$/g,'');
  s=s.replace(/^`+|`+$/g,'');
  s=s.replace(/^json$/i,'').trim();
  // タイトルが波括弧や記号のみの時は無効として扱う
  if (/^[\{\}\[\]\(\)\s]*$/.test(s)) s='';
  if(!s) s='タイトル（自動生成）';
  return s;
}
function deriveTitleFromMarkdown(md){
  const lines=String(md||'').split(/\r?\n/);
  for (const line of lines){
    const l=line.trim();
    if(!l) continue;
    const m=l.match(/^#{1,3}\s+(.+)/); if(m) return sanitizeTitle(m[1]);
    if(!/^```|^>|^\* |^- |^\d+\. /.test(l)) return sanitizeTitle(l);
  }
  return '';
}
function normalizeBullets(md){
  // 先頭の中黒・ビュレットを箇条書きに正規化
  return String(md||'')
    .replace(/^\s*[•・]\s?/gm,'- ')
    .replace(/^\s*◦\s?/gm,'  - ');
}
function unwrapParagraphs(md){
  // 段落中の不必要な改行をスペースへ（見出し/リスト/引用/コードは除外）
  const lines=String(md||'').split(/\r?\n/);
  const out=[]; let buf=''; let inFence=false;
  for(const raw of lines){
    const line=raw.replace(/\u200B/g,'');
    if(/^```/.test(line)){ inFence=!inFence; buf+=line+'\n'; continue; }
    if(inFence){ buf+=line+'\n'; continue; }
    if(/^\s*$/.test(line)){ if(buf) out.push(buf.trim()); out.push(''); buf=''; continue; }
    // 箇条書きや番号付きの字下げ改行を一行に連結
    if(/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/.test(line)){
      if(buf){ out.push(buf.trim()); buf=''; }
      // 次の数行が連続して単語単位の改行の場合は連結
      out.push(line.replace(/\s+$/,''));
      continue;
    }
    // 行頭が1文字や数文字で改行されているケース（縦伸び）を連結
    if(buf){ buf += (/[。.!?)]$/.test(buf) ? '\n' : ' ') + line.trim(); }
    else { buf = line.trim(); }
  }
  if(buf) out.push(buf.trim());
  return out.join('\n');
}
function preferBareUrls(md){
  const embedDomains=['openai.com','youtube.com','youtu.be','x.com','twitter.com','speakerdeck.com','slideshare.net','google.com','maps.app.goo.gl','gist.github.com'];
  return String(md||'').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(m,text,url)=>{
    try{
      const u=new URL(url); const host=u.hostname.replace(/^www\./,'');
      const isEmbed = embedDomains.some(d=>host.endsWith(d) || (url.includes('google.com/maps') && d.includes('google.com')));
      return isEmbed ? `${text}\n${url}\n` : `${text} (${url})`;
    }catch{return `${text} ${url}`;}
  });
}
function isGarbageLine(line){
  return /^[\s\{\}\[\]\(\)`]+$/.test(line || '');
}
function normalizeListItemSoftBreaks(md){
  const lines=String(md||'').split(/\r?\n/);
  const out=[]; let inItem=false;
  const listStartRe=/^(\s*)(?:[-*+]\s|\d+\.\s)/;
  for (let i=0;i<lines.length;i++){
    const line=lines[i];
    if (listStartRe.test(line)){
      inItem=true;
      out.push(line.replace(/\s+$/,''));
      continue;
    }
    if (inItem){
      // 空行 or 次のリスト開始でアイテム終端
      if (!line.trim()) { out.push(line); inItem=false; continue; }
      if (listStartRe.test(line)) { inItem=false; out.push(line); continue; }
      // 継続行は1行へ連結
      const last = out.pop() || '';
      out.push(last + ' ' + line.trim());
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}
function splitMarkdownBlocks(md){
  const lines=String(md||'').split(/\r?\n/);
  const blocks=[]; let cur=[]; let inFence=false; let fenceTag='';
  for(const line of lines){
    const m=line.match(/^```(.*)$/);
    if(m){
      if(!inFence){ inFence=true; fenceTag=m[1]||''; cur.push(line); }
      else { inFence=false; fenceTag=''; cur.push(line); blocks.push(cur.join('\n')); cur=[]; continue; }
    } else if(!inFence && line.trim()===''){ if(cur.length){ blocks.push(cur.join('\n')); cur=[]; continue; } }
    else if(!inFence && isGarbageLine(line)) { continue; }
    cur.push(line);
  }
  if(cur.length) blocks.push(cur.join('\n'));
  return blocks.filter(b=>{ const t=b.trim(); return t.length>0 && !isGarbageLine(t); });
}
function mdToHtml(block){
  // JSONが紛れ込んでしまった場合は本文候補のみ抽出
  try{
    const maybe = JSON.parse(block);
    if (maybe && typeof maybe==='object' && !Array.isArray(maybe)){
      const candidates=[maybe.body, maybe.draftBody, maybe.content, maybe.text];
      const chosen=candidates.find(v=>typeof v==='string' && v.trim());
      if (chosen) block = String(chosen);
    }
  }catch{}
  const isList = /^\s*(?:[-*+]\s|\d+\.\s)/.test(block);
  return String(marked.parse(block, { gfm:true, breaks: !isList, mangle:false, headerIds:false }) || '');
}
function htmlFromMarkdown(md){
  // 全文を一括でHTML化（段落ベース）。リスト中の意図しない <br> を避けるため breaks=false
  return String(marked.parse(md, { gfm:true, breaks:false, mangle:false, headerIds:false }) || '');
}
async function insertHTML(page, locator, html){
  await locator.click();
  await locator.evaluate((el, html) => {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertHTML', false, html);
  }, html);
}

let TITLE=sanitizeTitle(rawTitle);
let preBody = preferBareUrls(rawBody);
preBody = normalizeBullets(preBody);
preBody = normalizeListItemSoftBreaks(preBody);
preBody = unwrapParagraphs(preBody);
if(!TITLE || TITLE==='タイトル（自動生成）'){
  const d=deriveTitleFromMarkdown(preBody);
  if(d) TITLE=d;
}
const blocks = splitMarkdownBlocks(preBody);

let browser, context, page;
try{
  browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  context = await browser.newContext({ storageState: STATE_PATH, locale: 'ja-JP' });
  page = await context.newPage();
  page.setDefaultTimeout(180000);

  // ✅ デバッグ: ネットワーク監視
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log(`🔍 API Response: ${response.status()} ${response.url()}`);
    }
  });
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      console.log(`🔍 API Request: ${request.method()} ${request.url()}`);
    }
  });

  await page.goto(START_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('textarea[placeholder*="タイトル"]');

  // ✅ デバッグ1: 初期状態の確認
  await page.screenshot({ path: `${ssDir}/debug-1-initial-${nowStr()}.png`, fullPage: true });
  const titleExists = await page.locator('textarea[placeholder*="タイトル"]').count();
  const bodyExists = await page.locator('div[contenteditable="true"][role="textbox"]').count();
  const saveExists = await page.locator('button:has-text("下書き保存")').count();
  const saveAltExists = await page.locator('[aria-label*="下書き保存"]').count();
  console.log(`🔍 デバッグ: タイトル要素=${titleExists}, 本文要素=${bodyExists}, 下書き保存ボタン=${saveExists}, 代替保存ボタン=${saveAltExists}`);
  console.log(`🔍 現在のURL: ${page.url()}`);
  console.log(`🔍 処理予定タイトル: "${TITLE}"`);
  console.log(`🔍 処理予定本文長: ${preBody.length}文字`);

  await page.fill('textarea[placeholder*="タイトル"]', TITLE);

  // ✅ デバッグ2: タイトル入力後
  await page.screenshot({ path: `${ssDir}/debug-2-after-title-${nowStr()}.png`, fullPage: true });
  console.log(`🔍 タイトル入力完了: "${TITLE}"`);

  const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
  await bodyBox.waitFor({ state: 'visible' });
  const htmlAll = htmlFromMarkdown(preBody);
  let pasted = false;
  try {
    const origin = new URL(START_URL).origin;
    await context.grantPermissions(['clipboard-read','clipboard-write'], { origin });
    await page.evaluate(async (html, plain) => {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
    }, htmlAll, preBody);
    await bodyBox.click();
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(200);
    pasted = true;
    console.log(`🔍 クリップボード貼り付け成功`);
  } catch (e) {
    console.log(`🔍 クリップボード貼り付け失敗: ${e.message}`);
  }
  if (!pasted) {
    // 一括HTML挿入フォールバック
    console.log(`🔍 フォールバック: HTML直接挿入を実行`);
    await insertHTML(page, bodyBox, htmlAll);
    await page.waitForTimeout(100);
  }

  // ✅ デバッグ3: 本文入力後
  await page.screenshot({ path: `${ssDir}/debug-3-after-body-${nowStr()}.png`, fullPage: true });
  console.log(`🔍 本文入力完了`);

  if(!IS_PUBLIC){
    const saveBtn = page.locator('button:has-text("下書き保存"), [aria-label*="下書き保存"]').first();
    
    // ✅ デバッグ4: 保存ボタンクリック前
    await page.screenshot({ path: `${ssDir}/debug-4-before-save-${nowStr()}.png`, fullPage: true });
    
    // 代替セレクタも試行
    const saveBtnAlt1 = page.locator('button').filter({ hasText: '下書き保存' }).first();
    const saveBtnAlt2 = page.locator('[role="button"]').filter({ hasText: '下書き保存' }).first();
    const saveBtnAlt3 = page.locator('button').filter({ hasText: '保存' }).first();
    
    const saveExists1 = await saveBtn.count();
    const saveExists2 = await saveBtnAlt1.count();
    const saveExists3 = await saveBtnAlt2.count();
    const saveExists4 = await saveBtnAlt3.count();
    
    console.log(`🔍 保存ボタン検索結果:`);
    console.log(`  - 標準セレクタ: ${saveExists1}個`);
    console.log(`  - 代替1（hasText）: ${saveExists2}個`);
    console.log(`  - 代替2（role+hasText）: ${saveExists3}個`);
    console.log(`  - 代替3（保存のみ）: ${saveExists4}個`);
    
    let actualSaveBtn = saveBtn;
    if (saveExists1 === 0 && saveExists2 > 0) {
      actualSaveBtn = saveBtnAlt1;
      console.log(`🔍 代替1セレクタを使用`);
    } else if (saveExists1 === 0 && saveExists3 > 0) {
      actualSaveBtn = saveBtnAlt2;
      console.log(`🔍 代替2セレクタを使用`);
    } else if (saveExists1 === 0 && saveExists4 > 0) {
      actualSaveBtn = saveBtnAlt3;
      console.log(`🔍 代替3セレクタを使用`);
    }
    
    try {
      await actualSaveBtn.waitFor({ state: 'visible', timeout: 10000 });
      const isVisible = await actualSaveBtn.isVisible();
      const isEnabled = await actualSaveBtn.isEnabled();
      console.log(`🔍 下書き保存ボタン状態: 表示=${isVisible}, 有効=${isEnabled}`);
      
      if(isEnabled) { 
        console.log(`🔍 下書き保存ボタンをクリック中...`);
        await actualSaveBtn.click(); 
        
        // ✅ デバッグ5: 保存ボタンクリック後
        await page.screenshot({ path: `${ssDir}/debug-5-after-save-click-${nowStr()}.png`, fullPage: true });
        
        // 保存完了メッセージを待機
        try {
          await page.locator('text=保存しました').waitFor({ timeout: 4000 });
          console.log(`🔍 保存完了メッセージを確認`);
        } catch {
          console.log(`🔍 保存完了メッセージが見つからない（タイムアウト）`);
          // 代替の保存完了確認
          const altMessages = [
            'text=下書きに保存しました',
            'text=保存完了',
            'text=下書き保存完了',
            '[data-testid*="toast"]',
            '.toast',
            '[role="alert"]'
          ];
          for (const selector of altMessages) {
            const count = await page.locator(selector).count();
            if (count > 0) {
              console.log(`🔍 代替保存メッセージ発見: ${selector}`);
              break;
            }
          }
        }
      } else {
        console.log(`🔍 エラー: 下書き保存ボタンが無効状態`);
      }
    } catch (error) {
      console.log(`🔍 エラー: 下書き保存ボタンが見つからない - ${error.message}`);
    }
    
    // ✅ デバッグ6: 最終状態
    await page.screenshot({ path: `${ssDir}/debug-6-final-${nowStr()}.png`, fullPage: true });
    console.log(`🔍 最終URL: ${page.url()}`);
    console.log('DRAFT_URL=' + page.url());
    console.log('SCREENSHOT=' + SS_PATH);
    process.exit(0);
  }

  const proceed = page.locator('button:has-text("公開に進む")').first();
  await proceed.waitFor({ state: 'visible' });
  for (let i=0;i<20;i++){ if (await proceed.isEnabled()) break; await page.waitForTimeout(100); }
  await proceed.click({ force: true });

  await Promise.race([
    page.waitForURL(/\/publish/i).catch(() => {}),
    page.locator('button:has-text("投稿する")').first().waitFor({ state: 'visible' }).catch(() => {}),
  ]);

  const tags=(TAGS||'').split(/[\n,]/).map(s=>s.trim()).filter(Boolean);
  if(tags.length){
    let tagInput=page.locator('input[placeholder*="ハッシュタグ"]');
    if(!(await tagInput.count())) tagInput=page.locator('input[role="combobox"]').first();
    await tagInput.waitFor({ state: 'visible' });
    for(const t of tags){ await tagInput.click(); await tagInput.fill(t); await page.keyboard.press('Enter'); await page.waitForTimeout(120); }
  }

  const publishBtn = page.locator('button:has-text("投稿する")').first();
  await publishBtn.waitFor({ state: 'visible' });
  for (let i=0;i<20;i++){ if (await publishBtn.isEnabled()) break; await page.waitForTimeout(100); }
  await publishBtn.click({ force: true });

  await Promise.race([
    page.waitForURL(u => !/\/publish/i.test(typeof u === 'string' ? u : u.toString()), { timeout: 20000 }).catch(() => {}),
    page.locator('text=投稿しました').first().waitFor({ timeout: 8000 }).catch(() => {}),
    page.waitForTimeout(5000),
  ]);

  await page.screenshot({ path: SS_PATH, fullPage: true });
  const finalUrl=page.url();
  console.log('PUBLISHED_URL=' + finalUrl);
  console.log('SCREENSHOT=' + SS_PATH);
} finally {
  try{ await page?.close(); }catch{}
  try{ await context?.close(); }catch{}
  try{ await browser?.close(); }catch{}
}
