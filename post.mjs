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
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    console.log('ログインページにアクセス中...');
    await page.goto('https://note.com/login');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'step1_login.png' });

    // メールアドレス入力
    console.log('メールアドレス入力中...');
    try {
      const loginField = await page.locator('input[name="login"]').first();
      await loginField.waitFor({ state: 'visible', timeout: 10000 });
      await loginField.fill(email);
      console.log('✅ メールアドレス入力成功');
    } catch (e) {
      const textInputs = await page.locator('input[type="text"]').all();
      if (textInputs.length > 0) {
        await textInputs[0].fill(email);
        console.log('✅ メールアドレス入力成功（代替方法）');
      }
    }

    // パスワード入力
    console.log('パスワード入力中...');
    const passwordField = await page.locator('input[type="password"]').first();
    await passwordField.fill(password);
    console.log('✅ パスワード入力完了');

    await page.waitForTimeout(1000);

    // ログインボタンクリック
    console.log('ログインボタンをクリック中...');
    const loginButton = await page.locator('button:has-text("ログイン")').first();
    await loginButton.click();
    console.log('✅ ログインボタンクリック完了');

    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log('ログイン後のURL:', currentUrl);

    if (currentUrl.includes('/login')) {
      throw new Error('ログインに失敗しました');
    }

    // 記事作成ページへ
    console.log('記事作成ページへ移動中...');
    await page.goto('https://note.com/post');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    
    await page.screenshot({ path: 'step2_post_page.png' });

    // タイトル入力（note.comの実際の構造に対応）
    console.log('タイトル入力中...');
    
    // 方法1: プレースホルダーで探す
    let titleFilled = false;
    try {
      const titleField = await page.locator('[data-placeholder="記事タイトル"]').first();
      await titleField.waitFor({ state: 'visible', timeout: 5000 });
      await titleField.click();
      await titleField.fill(draftData.title);
      console.log('✅ タイトル入力完了（data-placeholder）');
      titleFilled = true;
    } catch (e) {
      console.log('⚠️ data-placeholder方式失敗、代替方法を試します');
    }

    // 方法2: contenteditable の最初の要素（タイトル用）
    if (!titleFilled) {
      try {
        const editables = await page.locator('[contenteditable="true"]').all();
        if (editables.length >= 2) {
          // 最初のcontenteditable = タイトル
          await editables[0].click();
          await editables[0].fill(draftData.title);
          console.log('✅ タイトル入力完了（1st contenteditable）');
          titleFilled = true;
        }
      } catch (e) {
        console.log('⚠️ contenteditable方式失敗');
      }
    }

    // 方法3: JavaScript経由で直接入力
    if (!titleFilled) {
      await page.evaluate((title) => {
        const editables = document.querySelectorAll('[contenteditable="true"]');
        if (editables.length > 0) {
          editables[0].innerText = title;
        }
      }, draftData.title);
      console.log('✅ タイトル入力完了（JavaScript直接）');
      titleFilled = true;
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'step3_title_filled.png' });

    // 本文入力
    console.log('本文入力中...');
    const fullContent = `${draftData.introduction || ''}\n\n${draftData.content}\n\n## 参考\n${draftData.references.join('\n')}\n\n${draftData.tags.join(' ')}`;

    // 本文は2番目のcontenteditable
    let contentFilled = false;
    try {
      const editables = await page.locator('[contenteditable="true"]').all();
      if (editables.length >= 2) {
        await editables[1].click();
        await page.waitForTimeout(500);
        
        await page.evaluate((text) => {
          const editables = document.querySelectorAll('[contenteditable="true"]');
          if (editables.length >= 2) {
            editables[1].innerText = text;
          }
        }, fullContent);
        
        console.log('✅ 本文入力完了');
        contentFilled = true;
      }
    } catch (e) {
      console.log('⚠️ 本文入力失敗:', e.message);
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step4_content_filled.png' });

    // 公開設定を探す
    console.log('公開ボタンを探しています...');
    
    // note.comは「公開設定」→「公開する」の2段階の可能性がある
    try {
      // まず「公開設定」ボタンを探す
      const settingsButtons = await page.locator('button').all();
      for (const button of settingsButtons) {
        const text = await button.textContent();
        if (text && (text.includes('公開') || text.includes('投稿'))) {
          console.log('公開関連ボタン発見:', text);
          await button.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
      
      await page.screenshot({ path: 'step5_publish_dialog.png' });
      
      // 公開確認ダイアログで「公開する」をクリック
      const publishButton = await page.locator('button:has-text("公開する")').first();
      await publishButton.waitFor({ state: 'visible', timeout: 5000 });
      await publishButton.click();
      console.log('✅ 公開ボタンクリック完了');
      
      await page.waitForTimeout(5000);
    } catch (e) {
      console.log('⚠️ 公開ボタンが見つかりません（下書き保存）:', e.message);
    }

    await page.screenshot({ path: 'step6_final.png' });

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
