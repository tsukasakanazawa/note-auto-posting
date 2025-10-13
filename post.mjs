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
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // セッション状態の復元（重要！）
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
    console.log('セッション状態復元完了');
    
    console.log('投稿ページに移動中...');
    await page.goto('https://note.com/post', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    await delay(10000);
    
    // 現在のURLとタイトルを確認
    const currentUrl = page.url();
    const pageTitle = await page.title();
    console.log(`現在のURL: ${currentUrl}`);
    console.log(`ページタイトル: ${pageTitle}`);
    
    // ログイン状態の確認
    if (currentUrl.includes('login')) {
      throw new Error('ログインページにリダイレクトされました。セッション状態が無効です。');
    }
    
    const inputs = await page.$$('input, textarea, [contenteditable]');
    console.log(`見つかった入力要素数: ${inputs.length}`);
    
    if (inputs.length > 0) {
      console.log('タイトル入力中...');
      await inputs[0].click();
      await page.keyboard.selectAll();
      await inputs[0].type(title);
      await delay(3000);
      
      if (inputs.length > 1) {
        console.log('本文入力中...');
        await inputs[1].click();
        await page.keyboard.selectAll();
        await inputs[1].type(content);
        await delay(5000);
      }
    }
    
    // 保存処理
    console.log('保存ボタンを探しています...');
    const buttons = await page.$$('button');
    console.log(`見つかったボタン数: ${buttons.length}`);
    
    let saveClicked = false;
    for (let i = 0; i < buttons.length; i++) {
      const buttonText = await page.evaluate(el => el.textContent, buttons[i]);
      console.log(`ボタン${i + 1}: "${buttonText}"`);
      
      if (buttonText && (buttonText.includes('保存') || buttonText.includes('下書き保存') || buttonText.includes('公開する'))) {
        console.log(`保存ボタンクリック: ${buttonText}`);
        await buttons[i].click();
        await delay(8000);
        saveClicked = true;
        break;
      }
    }
    
    if (!saveClicked) {
      console.log('保存ボタンが見つかりませんでした。最初のボタンをクリックします。');
      if (buttons.length > 0) {
        await buttons[0].click();
        await delay(8000);
      }
    }
    
    // 最終確認
    const finalUrl = page.url();
    console.log(`最終URL: ${finalUrl}`);
    console.log('投稿処理完了');
    
  } catch (error) {
    console.error('エラー:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  try {
    const mode = process.argv[2] || 'ai';
    
    if (mode === 'ai') {
      const theme = process.argv[3] || 'AI活用術';
      const target = process.argv[4] || 'ビジネスパーソン';
      const message = process.argv[5] || 'AIで生産性向上';
      const cta = process.argv[6] || '実際に試してみる';
      
      console.log('AI記事生成中...');
      const article = await generateArticle(theme, target, message, cta);
      
      const lines = article.split('\n').filter(line => line.trim());
      const title = lines[0].replace(/^#+\s*/, '');
      const content = lines.slice(1).join('\n').trim();
      
      console.log(`生成タイトル: ${title}`);
      console.log(`記事長: ${content.length}文字`);
      
      await postToNote(title, content);
    } else {
      await postToNote('テスト投稿', 'これはテスト投稿です。');
    }
    
  } catch (error) {
    console.error('実行エラー:', error);
    process.exit(1);
  }
}

main();
