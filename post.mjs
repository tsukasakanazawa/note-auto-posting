import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';

function nowStr(){ 
  const d=new Date(); 
  const z=n=>String(n).padStart(2,'0'); 
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`; 
}

const STATE_PATH=process.env.STATE_PATH;
const START_URL=process.env.START_URL||'https://editor.note.com/new';
const rawTitle=process.env.TITLE||'';
const TAGS=process.env.TAGS||'';
const IS_PUBLIC=String(process.env.IS_PUBLIC||'false')==='true';

// ✅ draft.jsonを読み込み（final.jsonではない）
let articleData;
try {
  if (fs.existsSync('draft.json')) {
    articleData = JSON.parse(fs.readFileSync('draft.json','utf8'));
    console.log('✅ draft.jsonから記事データを読み込み完了');
  } else {
    console.error('❌ draft.json が見つかりません');
    console.log('📋 現在のディレクトリ内容:');
    const files = fs.readdirSync('.');
    files.forEach(file => console.log(`  - ${file}`));
    process.exit(1);
  }
} catch (error) {
  console.error('❌ draft.json読み込みエラー:', error.message);
  process.exit(1);
}

const rawBody = String(articleData.draftBody || articleData.body || '');

function sanitizeTitle(t){
  let s=String(t||'').trim();
  s=s.replace(/^```[a-zA-Z0-9_-]*\s*$/,'').replace(/^```$/,'');
  s=s.replace(/^#+\s*/,'');
  s=s.replace(/^"+|"+$/g,'').replace(/^'+|'+$/g,'');
  s=s.replace(/^`+|`+$/g,'');
  s=s.replace(/^json$/i,'').trim();
  if (/^[\{\}\[\]\(\)\s]*$/.test(s)) s='';
  if(!s) s='タイトル（自動生成）';
  return s;
}

function processTextContent(text) {
  return String(text||'')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

let TITLE = sanitizeTitle(rawTitle || articleData.title || '');
let processedBody = processTextContent(rawBody);

if(!TITLE || TITLE==='タイトル（自動生成）'){
  const lines = processedBody.split('\n');
  for(const line of lines) {
    const clean = line.trim();
    if(clean && clean.length > 0) {
      TITLE = sanitizeTitle(clean);
      break;
    }
  }
}

console.log(`🔍 記事情報:`);
console.log(`  - タイトル: "${TITLE}"`);
console.log(`  - 本文: ${processedBody.length}文字`);
console.log(`  - タグ: ${TAGS || 'なし'}`);
console.log(`  - 公開設定: ${IS_PUBLIC ? '公開' : '下書き'}`);

if(!fs.existsSync(STATE_PATH)){ 
  console.error('❌ storageState not found:', STATE_PATH); 
  console.log('💡 NOTE_STORAGE_STATE_JSON シークレットが正しく設定されているか確認してください');
  process.exit(1); 
}

const ssDir=path.join(os.tmpdir(),'note-screenshots'); 
fs.mkdirSync(ssDir,{recursive:true}); 

let browser, context, page;
try{
  browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  context = await browser.newContext({ storageState: STATE_PATH, locale: 'ja-JP' });
  page = await context.newPage();
  page.setDefaultTimeout(180000);

  // デバッグ用ネットワーク監視
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log(`🔍 API Response: ${response.status()} ${response.url()}`);
    }
  });

  await page.goto(START_URL, { waitUntil: 'domcontentloaded' });
  console.log(`🔍 ページ読み込み完了: ${page.url()}`);

  // タイトル入力要素を探索
  const titleSelectors = [
    'textarea[placeholder*="タイトル"]',
    'input[placeholder*="タイトル"]', 
    'textarea[data-testid*="title"]',
    'input[data-testid*="title"]',
    '[contenteditable][data-placeholder*="タイトル"]'
  ];
  
  let titleElement = null;
  for (const selector of titleSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      titleElement = page.locator(selector).first();
      console.log(`🔍 タイトル要素発見: ${selector}`);
      break;
    } catch {
      console.log(`🔍 タイトル要素なし: ${selector}`);
    }
  }
  
  if (!titleElement) {
    console.log(`🔍 エラー: タイトル入力要素が見つからない`);
    await page.screenshot({ path: `${ssDir}/error-no-title-${nowStr()}.png`, fullPage: true });
    process.exit(1);
  }

  // デバッグ用スクリーンショット
  await page.screenshot({ path: `${ssDir}/debug-1-initial-${nowStr()}.png`, fullPage: true });

  // タイトル入力
  await titleElement.fill(TITLE);
  console.log(`🔍 タイトル入力完了`);
  await page.screenshot({ path: `${ssDir}/debug-2-after-title-${nowStr()}.png`, fullPage: true });

  // 本文入力要素を探索
  const bodySelectors = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-testid*="editor"]', 
    'div[contenteditable="true"]',
    'textarea[data-testid*="body"]',
    'textarea[placeholder*="本文"]'
  ];
  
  let bodyElement = null;
  for (const selector of bodySelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      bodyElement = page.locator(selector).first();
      console.log(`🔍 本文要素発見: ${selector} (${count}個)`);
      break;
    }
  }
  
  if (!bodyElement) {
    console.log(`🔍 エラー: 本文入力要素が見つからない`);
    await page.screenshot({ path: `${ssDir}/error-no-body-${nowStr()}.png`, fullPage: true });
    process.exit(1);
  }

  // 本文入力（シンプルなテキスト入力）
  await bodyElement.waitFor({ state: 'visible' });
  await bodyElement.click();
  await page.keyboard.type(processedBody, { delay: 10 });
  console.log(`🔍 本文入力完了`);
  await page.screenshot({ path: `${ssDir}/debug-3-after-body-${nowStr()}.png`, fullPage: true });

  if(!IS_PUBLIC){
    // 下書き保存ボタンを探索
    const saveSelectors = [
      'button:has-text("下書き保存")',
      'button:has-text("下書きに保存")',
      'button:has-text("保存")',
      '[aria-label*="下書き保存"]',
      '[aria-label*="保存"]',
      'button[data-testid*="draft"]',
      'button[data-testid*="save"]',
      '[role="button"]:has-text("下書き")',
      '[role="button"]:has-text("保存")'
    ];
    
    await page.screenshot({ path: `${ssDir}/debug-4-searching-save-${nowStr()}.png`, fullPage: true });
    
    let saveButton = null;
    console.log(`🔍 下書き保存ボタンを探索中...`);
    
    for (const selector of saveSelectors) {
      const count = await page.locator(selector).count();
      console.log(`🔍 "${selector}": ${count}個`);
      if (count > 0) {
        saveButton = page.locator(selector).first();
        const text = await saveButton.textContent();
        console.log(`🔍 発見！ボタンテキスト: "${text}"`);
        break;
      }
    }
    
    // 全ボタンを表示（デバッグ用）
    const allButtons = await page.locator('button').all();
    console.log(`🔍 全ボタン (${allButtons.length}個)：`);
    for (let i = 0; i < Math.min(10, allButtons.length); i++) {
      const text = await allButtons[i].textContent();
      const ariaLabel = await allButtons[i].getAttribute('aria-label');
      console.log(`  ${i+1}. "${text}" [${ariaLabel}]`);
    }
    
    if (!saveButton) {
      console.log(`🔍 エラー: 下書き保存ボタンが見つからない`);
      await page.screenshot({ path: `${ssDir}/error-no-save-button-${nowStr()}.png`, fullPage: true });
      process.exit(1);
    }
    
    try {
      await saveButton.waitFor({ state: 'visible', timeout: 10000 });
      const isVisible = await saveButton.isVisible();
      const isEnabled = await saveButton.isEnabled();
      console.log(`🔍 下書き保存ボタン状態: 表示=${isVisible}, 有効=${isEnabled}`);
      
      if(isVisible && isEnabled) { 
        console.log(`🔍 下書き保存ボタンをクリック`);
        await saveButton.click(); 
        await page.screenshot({ path: `${ssDir}/debug-5-after-save-${nowStr()}.png`, fullPage: true });
        
        // 保存完了待機
        await page.waitForTimeout(3000);
        console.log(`🔍 保存処理完了`);
      } else {
        console.log(`🔍 エラー: 下書き保存ボタンが使用不可`);
      }
    } catch (error) {
      console.log(`🔍 エラー: 保存処理中に問題発生 - ${error.message}`);
    }
    
    await page.screenshot({ path: `${ssDir}/debug-6-final-${nowStr()}.png`, fullPage: true });
    console.log(`🔍 最終URL: ${page.url()}`);
    console.log('DRAFT_URL=' + page.url());
    process.exit(0);
  }

  // 公開処理（省略...）

} finally {
  try{ await page?.close(); }catch{}
  try{ await context?.close(); }catch{}
  try{ await browser?.close(); }catch{}
}
