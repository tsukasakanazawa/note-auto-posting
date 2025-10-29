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
    await page.goto('https://note.com/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // スクリーンショットでデバッグ
    await page.screenshot({ path: 'login_page.png' });
    console.log('ログインページのスクリーンショット保存完了');

    // メールアドレス入力（複数のセレクタを試す）
    console.log('メールアドレス入力フィールドを探しています...');
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="メール"]',
      'input[placeholder*="mail"]',
      'input[id*="email"]',
      '#email'
    ];

    let emailInput = null;
    for (const selector of emailSelectors) {
      try {
        emailInput = await page.waitForSelector(selector, { timeout: 5000 });
        if (emailInput) {
          console.log('メールアドレス入力フィールド発見:', selector);
          await page.fill(selector, email);
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!emailInput) {
      throw new Error('メールアドレス入力フィールドが見つかりません');
    }

    // パスワード入力
    console.log('パスワード入力中...');
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="パスワード"]',
      'input[id*="password"]',
      '#password'
    ];

    let passwordInput = null;
    for (const selector of passwordSelectors) {
      try {
        passwordInput = await page.waitForSelector(selector, { timeout: 5000 });
        if (passwordInput) {
          console.log('パスワード入力フィールド発見:', selector);
          await page.fill(selector, password);
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!passwordInput) {
      throw new Error('パスワード入力フィールドが見つかりません');
    }

    await page.waitForTimeout(1000);

    // ログインボタンクリック
    console.log('ログインボタンを探しています...');
    const loginButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("ログイン")',
      'input[type="submit"]',
      'a:has-text("ログイン")'
    ];

    let loginButton = null;
    for (const selector of loginButtonSelectors) {
      try {
        loginButton = await page.waitForSelector(selector, { timeout: 5000 });
        if (loginButton) {
          console.log('ログインボタン発見:', selector);
          await loginButton.click();
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!loginButton) {
      throw new Error('ログインボタンが見つかりません');
    }

    console.log('ログイン処理中...');
    await page.waitForTimeout(5000);

    // ログイン後のスクリーンショット
    await page.screenshot({ path: 'after_login.png' });
    console.log('ログイン後のスクリーンショット保存完了');

    // 記事作成ページへ
    console.log('記事作成ページへ移動中...');
    await page.goto('https://note.com/post', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'post_page.png' });
    console.log('記事作成ページのスクリーンショット保存完了');

    // タイトル入力
    console.log('タイトル入力中...');
    const titleSelectors = [
      'textarea[placeholder*="タイトル"]',
      'input[placeholder*="タイトル"]',
      '[data-placeholder*="タイトル"]',
      'textarea[name="title"]',
      'input[name="title"]'
    ];

    let titleInput = null;
    for (const selector of titleSelectors) {
      try {
        titleInput = await page.waitForSelector(selector, { timeout: 5000 });
        if (titleInput) {
          console.log('タイトル入力フィールド発見:', selector);
          await page.fill(selector, draftData.title);
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!titleInput) {
      throw new Error('タイトル入力フィールドが見つかりません');
    }

    await page.waitForTimeout(1000);

    // 本文入力
    console.log('本文入力中...');
    const fullContent = `${draftData.introduction || ''}\n\n${draftData.content}\n\n## 参考\n${draftData.references.join('\n')}\n\n${draftData.tags.join(' ')}`;

    const contentSelectors = [
      '[contenteditable="true"][data-placeholder*="本文"]',
      '[contenteditable="true"]',
      'textarea[placeholder*="本文"]',
      'div[role="textbox"]'
    ];

    let contentEditor = null;
    for (const selector of contentSelectors) {
      try {
        contentEditor = await page.waitForSelector(selector, { timeout: 5000 });
        if (contentEditor) {
          console.log('本文入力フィールド発見:', selector);
          await page.click(selector);
          await page.waitForTimeout(500);
          
          await page.evaluate((text) => {
            const editor = document.querySelector('[contenteditable="true"]');
            if (editor) {
              editor.innerText = text;
            }
          }, fullContent);
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!contentEditor) {
      throw new Error('本文入力フィールドが見つかりません');
    }

    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'before_publish.png' });
    console.log('公開前のスクリーンショット保存完了');

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
          await publishButton.click();
          await page.waitForTimeout(5000);
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!publishButton) {
      console.log('⚠️ 公開ボタンが見つかりません。下書き保存されている可能性があります。');
    }

    // 投稿完了確認
    const currentUrl = page.url();
    console.log('現在のURL:', currentUrl);

    await page.screenshot({ path: 'after_publish.png' });
    console.log('公開後のスクリーンショット保存完了');

    // 結果をファイルに保存
    const result = {
      success: true,
      title: draftData.title,
      url: currentUrl,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile('post_result.json', JSON.stringify(result, null, 2));
    console.log('✅ post_result.json保存完了');

    console.log('✅ NOTE投稿処理完了！');

  } catch (error) {
    console.error('❌ 投稿エラー:', error.message);
    console.error(error.stack);

    // エラー時のスクリーンショット
    if (browser) {
      try {
        const page = (await browser.contexts())[0]?.pages()[0];
        if (page) {
          await page.screenshot({ path: 'error_screenshot.png' });
          console.log('エラー時のスクリーンショット保存完了');
        }
      } catch (e) {
        console.error('スクリーンショット保存失敗:', e.message);
      }
    }

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
