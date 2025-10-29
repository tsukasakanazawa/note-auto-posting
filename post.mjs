import { chromium } from 'playwright';
import fs from 'fs/promises';

async function postToNote() {
  let browser;
  
  try {
    console.log('=== NOTE投稿開始 ===');

    // draft.jsonを読み込み
    const draftData = JSON.parse(await fs.readFile('draft.json', 'utf-8'));
    console.log('✅ draft.json読み込み完了');
    console.log('タイトル:', draftData.title);

    // 環境変数から認証情報取得
    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;

    if (!email || !password) {
      throw new Error('NOTE_EMAILまたはNOTE_PASSWORDが設定されていません');
    }

    console.log('ブラウザ起動中...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // noteログインページ
    console.log('ログインページにアクセス中...');
    await page.goto('https://note.com/login');
    await page.waitForTimeout(2000);

    // メールアドレス入力
    console.log('メールアドレス入力中...');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    
    // ログインボタンクリック
    console.log('ログイン中...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // 記事作成ページへ
    console.log('記事作成ページへ移動中...');
    await page.goto('https://note.com/post');
    await page.waitForTimeout(2000);

    // タイトル入力
    console.log('タイトル入力中...');
    const titleSelector = 'textarea[placeholder*="タイトル"], input[placeholder*="タイトル"], [data-placeholder*="タイトル"]';
    await page.waitForSelector(titleSelector, { timeout: 10000 });
    await page.fill(titleSelector, draftData.title);
    await page.waitForTimeout(1000);

    // 本文入力
    console.log('本文入力中...');
    
    // 本文全体を組み立て
    const fullContent = `${draftData.introduction || ''}\n\n${draftData.content}\n\n## 参考\n${draftData.references.join('\n')}\n\n${draftData.tags.join(' ')}`;
    
    const contentSelector = '[contenteditable="true"][data-placeholder*="本文"], [contenteditable="true"]';
    await page.waitForSelector(contentSelector, { timeout: 10000 });
    await page.click(contentSelector);
    await page.waitForTimeout(500);
    
    // テキストを入力
    await page.evaluate((text) => {
      const editor = document.querySelector('[contenteditable="true"]');
      if (editor) {
        editor.innerText = text;
      }
    }, fullContent);
    
    await page.waitForTimeout(2000);

    // 公開ボタンを探す
    console.log('公開ボタンを探しています...');
    const publishButtonSelectors = [
      'button:has-text("公開する")',
      'button:has-text("投稿する")',
      'button[type="submit"]',
      'a:has-text("公開する")'
    ];

    let publishButton = null;
    for (const selector of publishButtonSelectors) {
      try {
        publishButton = await page.waitForSelector(selector, { timeout: 3000 });
        if (publishButton) {
          console.log('公開ボタン発見:', selector);
          break;
        }
      } catch (e) {
        // 次のセレクタを試す
      }
    }

    if (!publishButton) {
      console.log('⚠️ 公開ボタンが見つかりません。下書き保存されている可能性があります。');
    } else {
      console.log('公開ボタンをクリック中...');
      await publishButton.click();
      await page.waitForTimeout(3000);

      // 投稿完了確認
      const currentUrl = page.url();
      console.log('現在のURL:', currentUrl);

      if (currentUrl.includes('/n/')) {
        console.log('✅ 記事投稿成功！');
        console.log('記事URL:', currentUrl);
      } else {
        console.log('⚠️ 投稿完了の確認ができませんでした');
      }
    }

    // 結果をファイルに保存
    const result = {
      success: true,
      title: draftData.title,
      url: page.url(),
      timestamp: new Date().toISOString()
    };

    await fs.writeFile('post_result.json', JSON.stringify(result, null, 2));
    console.log('✅ post_result.json保存完了');

  } catch (error) {
    console.error('❌ 投稿エラー:', error.message);
    console.error(error.stack);

    // エラー結果を保存
    const errorResult = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    await fs.writeFile('post_result.json', JSON.stringify(errorResult, null, 2));

    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log('ブラウザクローズ完了');
    }
  }
}

postToNote();
