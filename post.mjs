import { chromium } from 'playwright';
import fs from 'fs/promises';

async function postToNote() {
  let browser;
  
  try {
    console.log('=== NOTE投稿開始 ===');

    const draftData = JSON.parse(await fs.readFile('draft.json', 'utf-8'));
    console.log('✅ draft.json読み込み完了');
    console.log('タイトル:', draftData.title);

    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;

    if (!email || !password) {
      throw new Error('NOTE_EMAILまたはNOTE_PASSWORDが設定されていません');
    }

    console.log('ブラウザ起動中...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('ログインページにアクセス中...');
    await page.goto('https://note.com/login');
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    // ログインページのスクリーンショット
    await page.screenshot({ path: '01_login.png' });
    console.log('スクリーンショット保存: 01_login.png');

    // メールアドレス入力
    console.log('メールアドレス入力中...');
    const emailInput = page.locator('input[name="login"]').first();
    await emailInput.waitFor({ timeout: 10000 });
    await emailInput.fill(email);
    console.log('✅ メールアドレス入力完了');

    // パスワード入力
    console.log('パスワード入力中...');
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ timeout: 10000 });
    await passwordInput.fill(password);
    console.log('✅ パスワード入力完了');

    await page.waitForTimeout(1000);

    // ログインボタンクリック
    console.log('ログインボタンをクリック中...');
    const loginBtn = page.locator('button:has-text("ログイン")').first();
    await loginBtn.waitFor({ timeout: 10000 });
    await loginBtn.click();
    console.log('✅ ログインボタンクリック完了');

    await page.waitForTimeout(5000);
    await page.screenshot({ path: '02_after_login.png' });

    const currentUrl = page.url();
    console.log('ログイン後のURL:', currentUrl);

    // 記事作成ページへ
    console.log('記事作成ページへ移動中...');
    await page.goto('https://note.com/post');
    await page.waitForLoadState('load');
    await page.waitForTimeout(4000);
    
    await page.screenshot({ path: '03_post_page.png' });
    console.log('スクリーンショット保存: 03_post_page.png');

    // ページ内のcontenteditable要素を確認
    const editableCount = await page.locator('[contenteditable="true"]').count();
    console.log('contenteditable要素の数:', editableCount);

    // タイトル入力
    console.log('タイトル入力中...');
    
    // JavaScriptで直接タイトルを設定
    await page.evaluate((title) => {
      const editables = document.querySelectorAll('[contenteditable="true"]');
      console.log('contenteditable数:', editables.length);
      
      if (editables.length >= 1) {
        // 最初の要素がタイトル
        const titleElement = editables[0];
        titleElement.focus();
        titleElement.innerText = title;
        console.log('タイトル設定完了:', title);
      } else {
        console.error('contenteditable要素が見つかりません');
      }
    }, draftData.title);
    
    console.log('✅ タイトル入力完了');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '04_title_filled.png' });

    // 本文入力
    console.log('本文入力中...');
    const fullContent = `${draftData.introduction || ''}\n\n${draftData.content}\n\n## 参考\n${draftData.references.join('\n')}\n\n${draftData.tags.join(' ')}`;

    await page.evaluate((content) => {
      const editables = document.querySelectorAll('[contenteditable="true"]');
      
      if (editables.length >= 2) {
        // 2番目の要素が本文
        const contentElement = editables[1];
        contentElement.focus();
        contentElement.innerText = content;
        console.log('本文設定完了、文字数:', content.length);
      } else {
        console.error('本文用contenteditable要素が見つかりません');
      }
    }, fullContent);
    
    console.log('✅ 本文入力完了');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '05_content_filled.png' });

    // 公開ボタンを探す
    console.log('公開ボタンを探しています...');
    
    // ページ内の全てのボタンをチェック
    const allButtons = await page.locator('button').all();
    console.log('ページ内のボタン数:', allButtons.length);
    
    let publishClicked = false;
    for (const button of allButtons) {
      const text = await button.textContent();
      console.log('ボタンテキスト:', text);
      
      if (text && (text.includes('公開') || text.includes('投稿'))) {
        console.log('公開ボタン発見:', text);
        await button.click();
        await page.waitForTimeout(3000);
        publishClicked = true;
        break;
      }
    }

    if (publishClicked) {
      await page.screenshot({ path: '06_publish_dialog.png' });
      
      // 公開確認ダイアログで再度「公開する」をクリック
      try {
        const confirmBtn = page.locator('button:has-text("公開する")').first();
        await confirmBtn.waitFor({ timeout: 5000 });
        await confirmBtn.click();
        console.log('✅ 公開確認ボタンクリック完了');
        await page.waitForTimeout(5000);
      } catch (e) {
        console.log('⚠️ 公開確認ダイアログなし（そのまま公開された可能性）');
      }
    } else {
      console.log('⚠️ 公開ボタンが見つかりません（下書き保存）');
    }

    await page.screenshot({ path: '07_final.png' });

    const finalUrl = page.url();
    console.log('最終URL:', finalUrl);

    const result = {
      success: true,
      title: draftData.title,
      url: finalUrl,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile('post_result.json', JSON.stringify(result, null, 2));
    console.log('✅ NOTE投稿処理完了！');

  } catch (error) {
    console.error('❌ 投稿エラー:', error.message);
    console.error(error.stack);

    if (browser) {
      try {
        const page = (await browser.contexts())[0]?.pages()[0];
        if (page) {
          await page.screenshot({ path: 'error.png' });
        }
      } catch (e) {}
    }

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
    }
  }
}

postToNote();
