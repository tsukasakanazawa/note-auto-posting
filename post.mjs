async function postToNote(title, content) {
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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
    console.log('セッション状態復元完了');
    
    console.log('投稿ページに移動中...');
    await page.goto('https://note.com/post', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    await delay(10000);
    
    // ログイン状態確認
    const currentUrl = page.url();
    console.log(`現在のURL: ${currentUrl}`);
    
    if (currentUrl.includes('login')) {
      throw new Error('ログインページにリダイレクトされました');
    }
    
    // 要素検索（安全性強化）
    const inputs = await page.$$('input, textarea, [contenteditable]');
    console.log(`見つかった入力要素数: ${inputs.length}`);
    
    if (inputs.length >= 2) {
      // タイトル入力
      console.log('タイトル入力中...');
      await inputs[0].click();
      await delay(1000);
      try {
        await inputs[0].type(title, { delay: 100 });
        console.log('タイトル入力完了');
      } catch (error) {
        console.log('タイトル入力エラー:', error.message);
      }
      
      await delay(3000);
      
      // 本文入力
      console.log('本文入力中...');
      await inputs[1].click();
      await delay(1000);
      try {
        await inputs[1].type(content, { delay: 50 });
        console.log('本文入力完了');
      } catch (error) {
        console.log('本文入力エラー:', error.message);
      }
      
      await delay(5000);
      
      // 保存処理
      console.log('保存処理実行中...');
      const buttons = await page.$$('button');
      
      if (buttons.length > 0) {
        await buttons[0].click(); // 最初のボタンをクリック
        console.log('保存ボタンクリック完了');
        await delay(8000);
      }
      
    } else {
      throw new Error('必要な入力要素が見つかりません');
    }
    
    console.log('投稿処理完了');
    
  } catch (error) {
    console.error('投稿エラー:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
