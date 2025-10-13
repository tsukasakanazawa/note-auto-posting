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

async function postToNote(title, content) {
  let browser = null;
  
  try {
    // ヘッドレスモード無効化（問題④の対策）
    browser = await puppeteer.launch({
      headless: true, // 本番はtrue、デバッグ時はfalseに変更可能
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    const page = await browser.newPage();
    
    // セッション状態の復元（問題①の対策）
    console.log('セッション状態復元中...');
    const storageState = await loadStorageState();
    
    // Cookiesを先に設定
    if (storageState.cookies) {
      await page.setCookie(...storageState.cookies);
    }
    
    // LocalStorage/SessionStorageを設定
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
    
    console.log('セッション状態復元完了');
    
    // まずnote.comトップページでログイン状態確認
    console.log('ログイン状態確認中...');
    await page.goto('https://note.com/', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    await delay(5000);
    
    // 投稿ページに移動
    console.log('投稿ページに移動中...');
    await page.goto('https://note.com/post', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    await delay(8000);
    
    // ログイン状態の確認
    const currentUrl = page.url();
    console.log('現在のURL: ' + currentUrl);
    
    if (currentUrl.includes('login') || currentUrl.includes('signin')) {
      throw new Error('ログインページにリダイレクトされました。セッション状態が無効です。');
    }
    
    // タイトル入力（より具体的なセレクタ）
    console.log('タイトル入力中...');
    await page.waitForSelector('input[placeholder*="タイトル"], input[data-testid*="title"], .title input', { timeout: 15000 });
    
    const titleSelector = await page.evaluate(() => {
      const selectors = [
        'input[placeholder*="タイトル"]',
        'input[data-testid*="title"]', 
        '.title input',
        'input[type="text"]:first-of-type'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          return selector;
        }
      }
      return null;
    });
    
    if (!titleSelector) {
      throw new Error('タイトル入力欄が見つかりません');
    }
    
    await page.click(titleSelector);
    await delay(2000);
    await page.type(titleSelector, title, { delay: 100 });
    console.log('タイトル入力完了');
    
    await delay(3000);
    
    // 本文入力（問題②の対策 - より具体的なセレクタ）
    console.log('本文エディタを探しています...');
    await page.waitForSelector('[contenteditable="true"], .editor [contenteditable], [data-testid*="editor"] [contenteditable]', { timeout: 15000 });
    
    // execCommandを使用した確実な入力
    await page.evaluate((content) => {
      const editors = document.querySelectorAll('[contenteditable="true"]');
      let targetEditor = null;
      
      // 本文エディタを特定（タイトルではない、より大きな要素）
      for (const editor of editors) {
        const rect = editor.getBoundingClientRect();
        if (rect.height > 100 && editor.offsetParent !== null) {
          targetEditor = editor;
          break;
        }
      }
      
      if (targetEditor) {
        targetEditor.focus();
        targetEditor.click();
        
        // execCommandを使用
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, content);
        
        return true;
      }
      return false;
    }, content);
    
    console.log('本文入力完了');
    await delay(5000);
    
    // 公開処理（問題③の対策）
    console.log('公開設定開始...');
    
    // 公開設定ボタンを探してクリック
    const publishButtons = [
      'button:contains("公開設定")',
      'button:contains("公開")',
      'button[data-testid*="publish"]',
      '.publish-button',
      'button:contains("投稿")'
    ];
    
    let publishClicked = false;
    for (const selector of publishButtons) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          await elements[0].click();
          console.log('公開設定ボタンクリック成功: ' + selector);
          publishClicked = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (publishClicked) {
      await delay(3000);
      
      // モーダル内の最終公開ボタンをクリック
      try {
        await page.waitForSelector('button:contains("公開する"), button[data-testid*="confirm"], .modal button:contains("公開")', { timeout: 10000 });
        const confirmButton = await page.$('button:contains("公開する"), button[data-testid*="confirm"], .modal button:contains("公開")');
        if (confirmButton) {
          await confirmButton.click();
          console.log('最終公開ボタンクリック完了');
          await delay(8000);
        }
      } catch (error) {
        console.log('最終公開ボタンが見つかりませんでした');
      }
    } else {
      console.log('公開設定ボタンが見つかりませんでした');
    }
    
    // 最終URL確認
    const finalUrl = page.url();
    console.log('最終URL: ' + finalUrl);
    
    if (finalUrl.includes('/n/')) {
      console.log('投稿成功！記事URL: ' + finalUrl);
    } else {
      console.log('投稿状態不明（下書き保存の可能性）');
    }
    
    console.log('投稿処理完了');
    
  } catch (error) {
    console.error('投稿エラー:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  try {
    const theme = process.argv[3] || 'AI活用術';
    const target = process.argv[4] || 'ビジネスパーソン';
    const message = process.argv[5] || 'AIで生産性向上';
    const cta = process.argv[6] || '実際に試してみる';
    
    console.log('AI記事生成中...');
    const article = await generateArticle(theme, target, message, cta);
    
    const lines = article.split('\n').filter(line => line.trim());
    const title = lines[0].replace(/^#+\s*/, '');
    const content = lines.slice(1).join('\n').trim();
    
    console.log('生成されたタイトル: ' + title);
    console.log('記事の長さ: ' + content.length + '文字');
    
    await postToNote(title, content);
    
  } catch (error) {
    console.error('実行エラー:', error);
    process.exit(1);
  }
}

main();
