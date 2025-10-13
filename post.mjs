import puppeteer from 'puppeteer';
import fs from 'fs';

// 遅延関数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// セッション状態読み込み
async function loadStorageState() {
  try {
    const sessionData = process.env.NOTE_STORAGE_STATE_JSON;
    if (sessionData) {
      return JSON.parse(sessionData);
    }
  } catch (error) {
    console.log('セッション状態の読み込みエラー:', error.message);
  }
  return { cookies: [], localStorage: {}, sessionStorage: {} };
}

async function postToNote() {
  let browser = null;
  
  try {
    // 記事データを読み込み
    console.log('記事データ読み込み中...');
    const articleData = JSON.parse(fs.readFileSync('article.json', 'utf8'));
    const title = articleData.title;
    const content = articleData.content;
    console.log(`タイトル: "${title}"`);
    console.log(`本文文字数: ${content.length}文字`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run'
      ]
    });
    
    const page = await browser.newPage();
    
    // ユーザーエージェント設定
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
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
    
    if (storageState.cookies && storageState.cookies.length > 0) {
      await page.setCookie(...storageState.cookies);
    }
    console.log('セッション状態復元完了');
    
    // 正しい投稿URLに移動
    console.log('投稿ページに移動中...');
    await page.goto('https://note.com/n/new', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    await delay(5000);
    
    // ログイン状態確認
    const currentUrl = page.url();
    console.log(`現在のURL: ${currentUrl}`);
    
    if (currentUrl.includes('signin') || currentUrl.includes('login')) {
      throw new Error('ログインが必要です。セッション情報を確認してください。');
    }
    
    // ページの要素を詳細分析
    console.log('ページ要素を分析中...');
    const pageAnalysis = await page.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
        .map((el, index) => ({
          index,
          tagName: el.tagName,
          type: el.type || 'unknown',
          placeholder: el.placeholder || '',
          contentEditable: el.contentEditable,
          className: el.className,
          visible: el.offsetParent !== null,
          text: el.textContent?.slice(0, 20) || ''
        }));
      
      const allButtons = Array.from(document.querySelectorAll('button'))
        .map((el, index) => ({
          index,
          text: el.textContent?.trim() || '',
          className: el.className,
          disabled: el.disabled,
          visible: el.offsetParent !== null
        }));
      
      return { inputs: allInputs, buttons: allButtons };
    });
    
    console.log('=== ページ分析結果 ===');
    console.log(`入力要素数: ${pageAnalysis.inputs.length}`);
    pageAnalysis.inputs.forEach((inp, i) => {
      if (inp.visible) {
        console.log(`  Input[${inp.index}]: ${inp.tagName}, placeholder="${inp.placeholder}", class="${inp.className}"`);
      }
    });
    
    console.log(`ボタン要素数: ${pageAnalysis.buttons.length}`);
    pageAnalysis.buttons.forEach((btn, i) => {
      if (btn.visible && btn.text) {
        console.log(`  Button[${btn.index}]: "${btn.text}", class="${btn.className}"`);
      }
    });
    
    // タイトル入力欄を特定
    console.log('タイトル入力欄を特定中...');
    let titleElement = null;
    const visibleInputs = pageAnalysis.inputs.filter(inp => inp.visible);
    
    // より確実なタイトル入力欄の特定
    for (let i = 0; i < visibleInputs.length; i++) {
      const inp = visibleInputs[i];
      if (inp.placeholder.includes('タイトル') || 
          inp.className.includes('title') ||
          (i === 0 && inp.tagName === 'INPUT')) {
        titleElement = await page.$(`input:nth-child(${inp.index + 1}), textarea:nth-child(${inp.index + 1}), [contenteditable="true"]:nth-child(${inp.index + 1})`);
        if (!titleElement) {
          // より安全な方法で要素を取得
          const elements = await page.$$('input, textarea, [contenteditable="true"]');
          if (elements[inp.index]) {
            titleElement = elements[inp.index];
          }
        }
        console.log(`タイトル入力欄として選択: Input[${inp.index}]`);
        break;
      }
    }
    
    // フォールバック: 最初の表示されている入力欄
    if (!titleElement && visibleInputs.length > 0) {
      const elements = await page.$$('input, textarea, [contenteditable="true"]');
      titleElement = elements[visibleInputs[0].index];
      console.log(`フォールバック: 最初の入力欄を使用 Input[${visibleInputs[0].index}]`);
    }
    
    if (!titleElement) {
      throw new Error('タイトル入力欄が見つかりません');
    }
    
    // タイトル入力
    console.log('タイトル入力中...');
    await titleElement.click();
    await delay(1000);
    await titleElement.focus();
    await delay(500);
    
    // 既存内容をクリア
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await delay(200);
    
    await titleElement.type(title, { delay: 100 });
    console.log('✅ タイトル入力完了');
    await delay(2000);
    
    // 本文入力欄を特定
    console.log('本文入力欄を特定中...');
    let contentElement = null;
    
    for (let i = 1; i < visibleInputs.length; i++) {
      const inp = visibleInputs[i];
      if (inp.contentEditable === 'true' || 
          inp.tagName === 'TEXTAREA' ||
          inp.className.includes('editor') ||
          inp.className.includes('content')) {
        const elements = await page.$$('input, textarea, [contenteditable="true"]');
        contentElement = elements[inp.index];
        console.log(`本文入力欄として選択: Input[${inp.index}]`);
        break;
      }
    }
    
    // フォールバック: 2番目の要素
    if (!contentElement && visibleInputs.length > 1) {
      const elements = await page.$$('input, textarea, [contenteditable="true"]');
      contentElement = elements[visibleInputs[1].index];
      console.log(`フォールバック: 2番目の入力欄を使用 Input[${visibleInputs[1].index}]`);
    }
    
    if (!contentElement) {
      throw new Error('本文入力欄が見つかりません');
    }
    
    // 本文入力
    console.log('本文入力中...');
    await contentElement.click();
    await delay(1000);
    await contentElement.focus();
    await delay(500);
    
    // 既存内容をクリア
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await delay(200);
    
    // 本文を段落ごとに入力
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      if (paragraph) {
        await contentElement.type(paragraph, { delay: 30 });
        if (i < paragraphs.length - 1) {
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
        }
        await delay(300);
      }
    }
    console.log('✅ 本文入力完了');
    await delay(3000);
    
    // 公開ボタンを探す（下書きではなく公開を優先）
    console.log('公開ボタンを探索中...');
    const visibleButtons = pageAnalysis.buttons.filter(btn => btn.visible && btn.text);
    
    let publishButton = null;
    let publishButtonIndex = -1;
    
    // 公開関連のボタンを優先的に探す
    for (const btn of visibleButtons) {
      const buttonText = btn.text.toLowerCase();
      if (buttonText.includes('公開') || 
          buttonText.includes('投稿') || 
          buttonText.includes('publish')) {
        publishButtonIndex = btn.index;
        console.log(`公開ボタン発見: "${btn.text}" Button[${btn.index}]`);
        break;
      }
    }
    
    // 下書き保存ボタンも確認（フォールバック）
    if (publishButtonIndex === -1) {
      for (const btn of visibleButtons) {
        const buttonText = btn.text.toLowerCase();
        if (buttonText.includes('保存') || 
            buttonText.includes('下書き') ||
            buttonText.includes('save')) {
          publishButtonIndex = btn.index;
          console.log(`下書き保存ボタンを使用: "${btn.text}" Button[${btn.index}]`);
          break;
        }
      }
    }
    
    // 最終フォールバック: 最後のボタン
    if (publishButtonIndex === -1 && visibleButtons.length > 0) {
      const lastButton = visibleButtons[visibleButtons.length - 1];
      publishButtonIndex = lastButton.index;
      console.log(`フォールバック: 最後のボタンを使用 "${lastButton.text}" Button[${lastButton.index}]`);
    }
    
    if (publishButtonIndex === -1) {
      throw new Error('公開ボタンが見つかりません');
    }
    
    // ボタンをクリック
    const buttons = await page.$$('button');
    publishButton = buttons[publishButtonIndex];
    
    console.log('公開ボタンをクリック中...');
    await publishButton.click();
    console.log('✅ 公開ボタンクリック完了');
    await delay(5000);
    
    // 確認ダイアログがある場合の処理
    console.log('確認ダイアログをチェック中...');
    try {
      const confirmButtons = await page.$$('button');
      for (const btn of confirmButtons) {
        const btnText = await page.evaluate(el => el.textContent, btn);
        if (btnText && (btnText.includes('確認') || btnText.includes('公開') || btnText.includes('OK'))) {
          console.log(`確認ボタンをクリック: "${btnText}"`);
          await btn.click();
          await delay(3000);
          break;
        }
      }
    } catch (error) {
      console.log('確認ダイアログ処理:', error.message);
    }
    
    // 投稿完了の確認
    await delay(5000);
    const finalUrl = page.url();
    console.log(`最終URL: ${finalUrl}`);
    
    // 成功判定
    if (finalUrl.includes('/n/n') || finalUrl !== 'https://note.com/n/new') {
      console.log('🎉 投稿が正常に完了しました！');
      console.log(`📰 記事URL: ${finalUrl}`);
      return { success: true, url: finalUrl };
    } else {
      console.log('⚠️ 投稿の完了を確認できませんでした');
      console.log('note.comのマイページで記事を確認してください');
      return { success: false, message: '投稿完了の確認ができませんでした' };
    }
    
  } catch (error) {
    console.error('❌ 投稿エラー:', error.message);
    throw error;
  } finally {
    if (browser) {
      console.log('ブラウザを終了中...');
      await browser.close();
    }
  }
}

// 実行
if (process.env.NODE_ENV !== 'test') {
  postToNote()
    .then(result => {
      console.log('投稿処理完了');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error(`投稿処理失敗: ${error.message}`);
      process.exit(1);
    });
}

export default postToNote;
