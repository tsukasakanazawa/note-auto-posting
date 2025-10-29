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
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // noteログインページ
    console.log('ログインページにアクセス中...');
    await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // スクリーンショット
    await page.screenshot({ path: 'login_page.png', fullPage: true });
    console.log('ログインページのスクリーンショット保存');

    // メールアドレス入力（note.comの実際のフィールド）
    console.log('メールアドレス入力中...');
    
    // note IDまたはメールアドレスのフィールドを探す
    const emailFieldSelectors = [
      'input[name="login"]',
      'input[placeholder*="メールアドレス"]',
      'input[placeholder*="note ID"]',
      'input[type="text"]'
    ];

    let emailFilled = false;
    for (const selector of emailFieldSelectors) {
      try {
        const field = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (field) {
          console.log('メールアドレスフィールド発見:', selector);
          await page.click(selector);
          await page.fill(selector, email);
          emailFilled = true;
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!emailFilled) {
      // 全ての input[type="text"] を探す
      const textInputs = await page.$$('input[type="text"]');
      if (textInputs.length > 0) {
        console.log('最初のテキスト入力フィールドを使用');
        await textInputs[0].click();
        await textInputs[0].fill(email);
        emailFilled = true;
      }
    }

    if (!emailFilled) {
      throw new Error('メールアドレス入力フィールドが見つかりません');
    }

    await page.waitForTimeout(1000);

    // パスワード入力
    console.log('パスワード入力中...');
    const passwordField = await page.waitForSelector('input[type="password"]', { timeout: 5000, state: 'visible' });
    await passwordField.click();
    await passwordField.fill(password);
    
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'login_filled.png', fullPage: true });
    console.log('入力完了時のスクリーンショット保存');

    // ログインボタンをクリック
    console.log('ログインボタンをクリック中...');
    const loginButtonSelectors = [
      'button:has-text("ログイン")',
      'button[type="submit"]',
      'input[type="submit"]'
    ];

    let loginClicked = false;
    for (const selector of loginButtonSelectors) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 3000, state: 'visible' });
        if (button) {
          console.log('ログインボタン発見:', selector);
          await button.click();
          loginClicked = true;
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!loginClicked) {
      // テキストで「ログイン」を含むボタンを探す
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.textContent();
        if (text && text.includes('ログイン')) {
          console.log('テキスト検索でログインボタン発見');
          await button.click();
          loginClicked = true;
          break;
        }
      }
    }

    if (!loginClicked) {
      throw new Error('ログインボタンが見つかりません');
    }

    console.log('ログイン処理中...');
    await page.waitForTimeout(5000);

    // ログイン後の確認
    await page.screenshot({ path: 'after_login.png', fullPage: true });
    console.log('ログイン後のスクリーンショット保存');

    const currentUrl = page.url();
    console.log('現在のURL:', currentUrl);

    if (currentUrl.includes('/login')) {
      throw new Error('ログインに失敗しました（まだログインページにいます）');
    }

    // 記事作成ページへ
    console.log('記事作成ページへ移動中...');
    await page.goto('https://note.com/post', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'post_page.png', fullPage: true });
    console.log('記事作成ページのスクリーンショット保存');

    // タイトル入力
    console.log('タイトル入力中...');
    const titleSelectors = [
      'textarea[placeholder*="タイトル"]',
      'input[placeholder*="タイトル"]',
      'textarea[name="title"]',
      '[data-placeholder*="タイトル"]'
    ];

    let titleFilled = false;
    for (const selector of titleSelectors) {
      try {
        const field = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (field) {
          console.log('タイトルフィールド発見:', selector);
          await field.click();
          await field.fill(draftData.title);
          titleFilled = true;
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!titleFilled) {
      console.warn('⚠️ タイトル入力フィールドが見つかりません');
    }

    await page.waitForTimeout(1000);

    // 本文入力
    console.log('本文入力中...');
    const fullContent = `${draftData.introduction || ''}\n\n${draftData.content}\n\n## 参考\n${draftData.references.join('\n')}\n\n${draftData.tags.join(' ')}`;

    const contentSelectors = [
      '[contenteditable="true"]',
      'div[role="textbox"]',
      'textarea[placeholder*="本文"]'
    ];

    let contentFilled = false;
    for (const selector of contentSelectors) {
      try {
        const field = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (field) {
          console.log('本文フィールド発見:', selector);
          await field.click();
          await page.waitForTimeout(500);
          
          // contenteditable要素の場合
          if (selector.includes('contenteditable')) {
            await page.evaluate((text) => {
              const editors = document.querySelectorAll('[contenteditable="true"]');
              // タイトル以外の最初のcontenteditable要素を使用
              for (let editor of editors) {
                if (!editor.getAttribute('placeholder')?.includes('タイトル')) {
                  editor.innerText = text;
                  break;
                }
              }
            }, fullContent);
          } else {
            await field.fill(fullContent);
          }
          
          contentFilled = true;
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!contentFilled) {
      console.warn('⚠️ 本文入力フィールドが見つかりません');
    }

    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'before_publish.png', fullPage: true });
    console.log('公開前のスクリーンショット保存');

    // 公開設定（下書きではなく公開にする）
    console.log('公開設定を確認中...');
    
    // 「公開する」「投稿する」などのボタンを探す
    const publishButtonSelectors = [
      'button:has-text("公開する")',
      'button:has-text("投稿する")',
      'a:has-text("公開する")'
    ];

    let published = false;
    for (const selector of publishButtonSelectors) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (button) {
          console.log('公開ボタン発見:', selector);
          await button.click();
          await page.waitForTimeout(5000);
          published = true;
          break;
        }
      } catch (e) {
        console.log('セレクタ失敗:', selector);
      }
    }

    if (!published) {
      console.log('⚠️ 公開ボタンが見つかりません。下書き保存されている可能性があります。');
    }

    // 最終確認
    const finalUrl = page.url();
    console.log('最終URL:', finalUrl);

    await page.screenshot({ path: 'final.png', fullPage: true });
    console.log('最終スクリーンショット保存');

    // 結果を保存
    const result = {
      success: true,
      title: draftData.title,
      url: finalUrl,
      published: published,
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
        const contexts = await browser.contexts();
        if (contexts.length > 0) {
          const pages = contexts[0].pages();
          if (pages.length > 0) {
            await pages[0].screenshot({ path: 'error.png', fullPage: true });
            console.log('エラー時のスクリーンショット保存');
          }
        }
      } catch (e) {
        console.error('スクリーンショット保存失敗:', e.message);
      }
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
      console.log('ブラウザクローズ完了');
    }
  }
}

postToNote();
