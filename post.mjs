import { chromium } from 'playwright';
import fs from 'fs/promises';

async function autoPost(title, content, tagsStr = '', isPublicStr = 'false') {
  console.log('🚀 自動投稿を開始...');
  
  const tags = tagsStr ? tagsStr.split(',').map(tag => tag.trim()) : [];
  const isPublic = isPublicStr === 'true';
  
  // セッション状態を読み込み
  const sessionData = JSON.parse(await fs.readFile('note-state.json', 'utf8'));
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    storageState: sessionData
  });
  
  const page = await context.newPage();
  
  try {
    console.log('📝 note記事作成ページにアクセス中...');
    await page.goto('https://note.com/new', { waitUntil: 'networkidle' });
    
    // タイトル入力
    console.log('✏️ タイトルを入力中...');
    await page.waitForSelector('textarea[placeholder*="タイトル"], input[placeholder*="タイトル"]');
    await page.fill('textarea[placeholder*="タイトル"], input[placeholder*="タイトル"]', title);
    
    // 本文入力
    console.log('📖 本文を入力中...');
    await page.waitForSelector('[data-placeholder*="本文"], .DraftEditor-root');
    await page.click('[data-placeholder*="本文"], .DraftEditor-root');
    await page.keyboard.type(content);
    
    // 保存/公開
    if (isPublic) {
      console.log('📢 記事を公開中...');
      await page.click('button:has-text("公開する")');
    } else {
      console.log('💾 下書きとして保存中...');
      await page.click('button:has-text("下書き保存"), button:has-text("保存")');
    }
    
    console.log('✅ 投稿完了！');
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
}

// コマンドライン引数から実行
const [,, title, content, tags, isPublic] = process.argv;
autoPost(title, content, tags, isPublic);
