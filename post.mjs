import puppeteer from 'puppeteer';
import { generateArticle } from './ai-writer.mjs';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadStorageState() {
  try {
    const stateJson = process.env.NOTE_STORAGE_STATE_JSON;
    if (!stateJson) {
      throw new Error('NOTE_STORAGE_STATE_JSON環境変数が設定されていません');
    }
    return JSON.parse(stateJson);
  } catch (error) {
    console.error('ストレージ状態の読み込みエラー:', error);
    throw error;
  }
}

async function postToNote(title, content, isPublic = false) {
  let browser = null;
  
  try {
    console.log('ブラウザ起動中...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // セッション状態の復元
    console.log('セッション状態復元中...');
    const storageState = await loadStorageState();
    
    await page.evaluateOnNewDocument((state) => {
      if (state.localStorage) {
        for (const [key, value] of Object.entries(state.localStorage)) {
          localStorage.setItem(key, value);
        }
      }
      if (state.sessionStorage) {
        for (const [key, value] of Object.entries(state.sessionStorage)) {
          sessionStorage.setItem(key, value);
        }
      }
    }, storageState);
    
    if (storageState.cookies) {
      await page.setCookie(...storageState.cookies);
    }
    
    // note投稿ページへ移動
    console.log('note投稿ページへ移動中...');
    await page.goto('https://note.com/post', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await delay(3000);
    
    // タイトル入力
    console.log('タイトル入力中...');
    await page.waitForSelector('input[placeholder*="タイトル"]', { timeout: 10000 });
    await page.click('input[placeholder*="タイトル"]');
    await page.type('input[placeholder*="タイトル"]', title);
    
    await delay(2000);
    
    // 本文入力
    console.log('本文入力中...');
    await page.waitForSelector('.editor', { timeout: 10000 });
    await page.click('.editor');
    await page.type('.editor', content);
    
    await delay(3000);
    
    // 公開設定
    if (isPublic) {
      console.log('記事を公開設定に変更中...');
      try {
        await page.waitForSelector('button[data-testid="publish-button"]', { timeout: 5000 });
        await page.click('button[data-testid="publish-button"]');
        await delay(2000);
        
        // 公開確認ボタン
        await page.waitForSelector('button[data-testid="publish-confirm-button"]', { timeout: 5000 });
        await page.click('button[data-testid="publish-confirm-button"]');
        console.log('記事を公開しました！');
      } catch (error) {
        console.log('公開ボタンが見つからないため、下書き保存します');
        await saveDraft(page);
      }
    } else {
      await saveDraft(page);
    }
    
    await delay(3000);
    console.log('投稿完了！');
    
  } catch (error) {
    console.error('投稿エラー:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function saveDraft(page) {
  try {
    console.log('下書き保存中...');
    await page.waitForSelector('button[data-testid="save-draft-button"]', { timeout: 5000 });
    await page.click('button[data-testid="save-draft-button"]');
    console.log('下書きとして保存しました！');
  } catch (error) {
    console.log('下書き保存ボタンが見つからない場合があります:', error.message);
  }
}

// メイン実行部分
async function main() {
  try {
    const mode = process.argv[2] || 'manual';
    
    if (mode === 'ai') {
      // AI生成モード
      const theme = process.argv[3] || 'AI活用術';
      const target = process.argv[4] || 'ビジネスパーソン';
      const message = process.argv[5] || 'AIで生産性向上';
      const cta = process.argv[6] || '実際に試してみる';
      const isPublic = process.argv[7] === 'true';
      
      console.log('=== AI記事生成モード ===');
      console.log(`テーマ: ${theme}`);
      console.log(`想定読者: ${target}`);
      console.log(`メッセージ: ${message}`);
      console.log(`CTA: ${cta}`);
      console.log(`公開設定: ${isPublic ? '公開' : '下書き'}`);
      
      // AI記事生成
      console.log('AI記事生成中...');
      const article = await generateArticle(theme, target, message, cta);
      
      // タイトルを記事から抽出（最初の行を使用）
      const lines = article.split('\n').filter(line => line.trim());
      const title = lines[0].replace(/^#+\s*/, ''); // マークダウンのヘッダー記号を除去
      const content = lines.slice(1).join('\n').trim();
      
      console.log(`生成されたタイトル: ${title}`);
      console.log(`記事の長さ: ${content.length}文字`);
      
      // noteに投稿
      await postToNote(title, content, isPublic);
      
    } else {
      // 手動モード
      const title = process.argv[3] || 'テスト投稿';
      const content = process.argv[4] || 'これはテスト投稿です。';
      const isPublic = process.argv[5] === 'true';
      
      console.log('=== 手動モード ===');
      console.log(`タイトル: ${title}`);
      console.log(`公開設定: ${isPublic ? '公開' : '下書き'}`);
      
      await postToNote(title, content, isPublic);
    }
    
  } catch (error) {
    console.error('実行エラー:', error);
    process.exit(1);
  }
}

main();
