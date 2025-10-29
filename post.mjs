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

    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;

    if (!email || !password) {
      throw new Error('NOTE_EMAILまたはNOTE_PASSWORDが設定されていません');
    }

    console.log('ブラウザ起動中...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    console.log('ログインページにアクセス中...');
    await page.goto('https://note.com/login');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'step1_login_page.png' });
    console.log('スクリーンショット: step1_login_page.png');

    // メールアドレス入力
    console.log('メールアドレス入力中...');
    
    // 方法1: input[name="login"] を試す
    try {
      const loginField = await page.locator('input[name="login"]').first();
      await loginField.waitFor({ state: 'visible', timeout: 10000 });
      await loginField.click();
      await loginField.fill(email);
      console.log('✅ input[name="login"] で入力成功');
    } catch (e1) {
      console.log('⚠️ input[name="login"] 失敗、他の方法を試します');
      
      // 方法2: 最初のテキスト入力を使う
      try {
        const textInputs = await page.locator('input[type="text"]').all();
        if (textInputs.length > 0) {
          await textInputs[0].click();
          await textInputs[0].fill(email);
          console.log('✅ input[type="text"] で入力成功');
        } else {
          throw new Error('テキスト入力フィールドが見つかりません');
        }
      } catch (e2) {
        console.log('⚠️ input[type="text"] も失敗');
        
        // 方法3: 全てのinputを探す
        const allInputs = await page.locator('input').all();
        console.log('ページ内のinput要素数:', allInputs.length);
        
        if (allInputs.length > 0) {
          // パスワード以外の最初のinput
          for (const input of allInputs) {
            const inputType = await input.getAttribute('type');
            if (inputType !== 'password' && inputType !== 'submit') {
              await input.click();
              await input.fill(email);
              console.log('✅ 最初の利用可能なinputで入力成功');
              break;
            }
          }
        } else {
          throw new Error('入力フィールドが全く見つかりません');
        }
      }
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'step2_email_filled.png' });

    // パスワード入力
    console.log('パスワード入力中...');
    const passwordField = await page.locator('input[type="password"]').first();
    await passwordField.waitFor({ state: 'visible', timeout: 10000 });
    await passwordField.click();
    await passwordField.fill(password);
    console.log('✅ パスワード入力完了');

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'step3_password_filled.png' });

    // ログインボタンをクリック
    console.log('ログインボタンをクリック中...');
    const loginButton = await page.locator('button:has-text("ログイン")').first();
    await loginButton.waitFor({ state: 'visible', timeout: 10000 });
    await loginButton.click();
    console.log('✅ ログインボタンクリック完了');

    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'step4_after_login.png' });

    const currentUrl = page.url();
    console.log('ログイン後のURL:', currentUrl);

    if (currentUrl.includes('/login')) {
      throw new Error('ログインに失敗しました');
    }

    // 記事作成ページへ
    console.log('記事作成ページへ移動中...');
    await page.goto('https://note.com/post');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'step5_post_page.png' });

    // タイトル入力
    console.log('タイトル入力中...');
    const titleField = await page.locator('textarea[placeholder*="タイトル"], input[placeholder*="タイトル"]').first();
    await titleField.waitFor({ state: 'visible', timeout: 10000 });
    await titleField.click();
    await titleField.fill(draftData.title);
    console.log('✅ タイトル入力完了');

    await page.waitForTimeout(1000);

    // 本文入力
    console.log('本文入力中...');
    const fullContent = `${draftData.introduction || ''}\n\n${draftData.content}\n\n## 参考\n${draftData.references.join('\n')}\n\n${draftData.tags.join(' ')}`;

    const contentField = await page.locator('[contenteditable="true"]').last();
    await contentField.waitFor({ state: 'visible', timeout: 10000 });
    await contentField.click();
    
    await page.evaluate((text) => {
      const editors = document.querySelectorAll('[contenteditable="true"]');
      if (editors.length > 0) {
        const mainEditor = editors[editors.length - 1];
        mainEditor.innerText = text;
      }
    }, fullContent);
    
    console.log('✅ 本文入力完了');

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step6_content_filled.png' });

    // 公開ボタンをクリック
    console.log('公開ボタンを探しています...');
    try {
      const publishButton = await page.locator('button:has-text("公開する"), button:has-text("投稿する")').first();
      await publishButton.waitFor({ state: 'visible', timeout: 10000 });
      await publishButton.click();
      console.log('✅ 公開ボタンクリック完了');
      await page.waitForTimeout(5000);
    } catch (e) {
      console.log('⚠️ 公開ボタンが見つかりません（下書き保存の可能性）');
    }

    await page.screenshot({ path: 'step7_final.png' });

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
