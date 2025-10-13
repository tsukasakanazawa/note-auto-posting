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
    
    await delay(5000);
    
    // 複数のタイトルセレクタを試行
    console.log('タイトル入力欄を探しています...');
    const titleSelectors = [
      'input[placeholder*="タイトル"]',
      'input[placeholder*="title"]',
      'input[data-testid="title-input"]',
      '.title-input',
      '[data-name="title"]',
      'textarea[placeholder*="タイトル"]',
      'input[type="text"]'
    ];
    
    let titleFound = false;
    for (const selector of titleSelectors) {
      try {
        console.log(`タイトルセレクタ試行: ${selector}`);
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        await page.type(selector, title);
        console.log('タイトル入力成功！');
        titleFound = true;
        break;
      } catch (error) {
        console.log(`セレクタ ${selector} で失敗: ${error.message}`);
        continue;
      }
    }
    
    if (!titleFound) {
      throw new Error('タイトル入力欄が見つかりませんでした');
    }
    
    await delay(3000);
    
    // 複数の本文セレクタを試行
    console.log('本文入力欄を探しています...');
    const contentSelectors = [
      '.editor',
      '[data-testid="editor"]',
      '.note-editor',
      '[contenteditable="true"]',
      'textarea',
      '.content-editor'
    ];
    
    let contentFound = false;
    for (const selector of contentSelectors) {
      try {
        console.log(`本文セレクタ試行: ${selector}`);
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        await page.type(selector, content);
        console.log('本文入力成功！');
        contentFound = true;
        break;
      } catch (error) {
        console.log(`セレクタ ${selector} で失敗: ${error.message}`);
        continue;
      }
    }
    
    if (!contentFound) {
      throw new Error('本文入力欄が見つかりませんでした');
    }
    
    await delay(5000);
    
    // 保存処理（公開設定は一旦スキップして下書き保存）
    console.log('下書き保存を試行中...');
    const saveSelectors = [
      'button[data-testid="save-draft-button"]',
      'button:contains("下書き保存")',
      'button:contains("保存")',
      '.save-button',
      '[data-name="save"]'
    ];
    
    let saved = false;
    for (const selector of saveSelectors) {
      try {
        console.log(`保存セレクタ試行: ${selector}`);
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        console.log('保存成功！');
        saved = true;
        break;
      } catch (error) {
        console.log(`セレクタ ${selector} で失敗: ${error.message}`);
        continue;
      }
    }
    
    if (!saved) {
      console.log('保存ボタンが見つからない場合があります（手動保存が必要かもしれません）');
    }
    
    await delay(3000);
    console.log('投稿処理完了！');
    
  } catch (error) {
    console.error('投稿エラー:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
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
