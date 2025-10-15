import fs from 'fs';
import { chromium } from 'playwright';

async function postToNote(topic, targetAudience, keywords, experience, isPublished) {
  console.log('=== note.com投稿開始 ===');
  console.log(`公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`);

  let browser;
  try {
    // draft.jsonの存在確認と読み込み
    if (!fs.existsSync('draft.json')) {
      throw new Error('draft.jsonが見つかりません。');
    }

    console.log('draft.json読み込み中...');
    const draftContent = fs.readFileSync('draft.json', 'utf8');
    const article = JSON.parse(draftContent);

    if (!article.title || !article.content) {
      throw new Error('draft.jsonの内容が不完全です。');
    }

    console.log(`記事タイトル: ${article.title}`);
    console.log(`記事文字数: ${article.content.length}`);

    // 認証情報の確認
    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;

    if (!email || !password) {
      console.log('認証情報が設定されていません。');
      await saveArticleToFile(article, isPublished);
      return true;
    }

    // Playwrightでnote.comにアクセス
    console.log('ブラウザ起動中...');
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();

    // ステップ1: ログイン
    console.log('=== STEP 1: ログイン処理 ===');
    const loginSuccess = await performLogin(page, email, password);
    
    if (!loginSuccess) {
      await saveArticleToFile(article, isPublished);
      return true;
    }

    // ステップ2: 記事作成ページに移動
    console.log('=== STEP 2: 記事作成ページに移動 ===');
    await page.goto('https://note.com/note/new', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    
    await page.waitForTimeout(5000); // ページ読み込み待機を長めに
    console.log('記事作成ページアクセス完了');
    console.log('現在のURL:', page.url());

    // ステップ3: ページ構造の詳細調査
    console.log('=== STEP 3: ページ構造調査 ===');
    await debugPageStructure(page);

    // ステップ4: 記事内容入力（改善版）
    console.log('=== STEP 4: 記事内容入力 ===');
    const inputSuccess = await inputArticleContentAdvanced(page, article);
    
    if (!inputSuccess) {
      console.log('記事内容の入力に失敗しました。');
      await saveArticleToFile(article, isPublished);
      return true;
    }

    // ステップ5: スクリーンショット撮影（デバッグ用）
    try {
      await page.screenshot({ path: 'note-page-debug.png', fullPage: true });
      console.log('デバッグ用スクリーンショットを撮影しました');
    } catch (e) {
      console.log('スクリーンショット撮影に失敗');
    }

    // ステップ6: 投稿実行
    console.log('=== STEP 5: 投稿実行 ===');
    const postSuccess = await executePostAdvanced(page, isPublished);
    
    if (postSuccess) {
      const currentUrl = page.url();
      console.log('記事投稿成功！');
      console.log(`記事URL: ${currentUrl}`);
      await saveSuccessResult(article, currentUrl, isPublished);
    } else {
      console.log('投稿処理が完了しましたが、確認できませんでした。');
      await saveArticleToFile(article, isPublished);
    }

    return true;

  } catch (error) {
    console.error('note.com投稿エラー:', error);
    
    try {
      const draftContent = fs.readFileSync('draft.json', 'utf8');
      const article = JSON.parse(draftContent);
      await saveArticleToFile(article, isPublished, error.message);
    } catch (e) {
      console.error('記事保存もエラー:', e.message);
    }
    
    return true;
  } finally {
    if (browser) {
      await browser.close();
      console.log('ブラウザを閉じました');
    }
  }
}

async function performLogin(page, email, password) {
  try {
    console.log('ログインページに移動中...');
    await page.goto('https://note.com/login', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });

    await page.waitForTimeout(3000);

    // メールアドレス入力
    console.log('メールアドレス入力中...');
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="メール" i]',
      'input[placeholder*="mail" i]'
    ];

    let emailInputted = false;
    for (const selector of emailSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          await element.fill(email);
          console.log(`メールアドレス入力完了: ${selector}`);
          emailInputted = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!emailInputted) {
      throw new Error('メールアドレス入力フィールドが見つかりません');
    }

    // パスワード入力
    console.log('パスワード入力中...');
    const passwordSelectors = ['input[type="password"]', 'input[name="password"]'];

    let passwordInputted = false;
    for (const selector of passwordSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          await element.fill(password);
          console.log(`パスワード入力完了: ${selector}`);
          passwordInputted = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!passwordInputted) {
      throw new Error('パスワード入力フィールドが見つかりません');
    }

    // ログインボタンクリック
    console.log('ログインボタンをクリック中...');
    const loginSelectors = [
      'button[type="submit"]',
      'button:has-text("ログイン")',
      'input[type="submit"]'
    ];

    let loginClicked = false;
    for (const selector of loginSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          await element.click();
          console.log(`ログインボタンクリック完了: ${selector}`);
          loginClicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!loginClicked) {
      throw new Error('ログインボタンが見つかりません');
    }

    // ログイン完了を待機
    console.log('ログイン処理完了を待機中...');
    await page.waitForTimeout(5000);
    
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      throw new Error('ログインページから移動していません');
    }

    console.log('ログイン成功');
    return true;

  } catch (loginError) {
    console.error('ログインエラー:', loginError.message);
    return false;
  }
}

async function debugPageStructure(page) {
  try {
    console.log('=== ページ構造詳細調査 ===');
    
    // ページタイトルとURL
    console.log('ページタイトル:', await page.title());
    console.log('現在のURL:', page.url());
    
    // 全ての入力要素を調査
    console.log('=== 入力要素一覧 ===');
    const inputs = await page.locator('input').all();
    console.log(`入力要素数: ${inputs.length}`);
    
    for (let i = 0; i < Math.min(inputs.length, 10); i++) {
      const input = inputs[i];
      const type = await input.getAttribute('type').catch(() => 'unknown');
      const name = await input.getAttribute('name').catch(() => 'unknown');
      const placeholder = await input.getAttribute('placeholder').catch(() => 'unknown');
      const id = await input.getAttribute('id').catch(() => 'unknown');
      const className = await input.getAttribute('class').catch(() => 'unknown');
      
      console.log(`Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}, id=${id}, class=${className}`);
    }
    
    // 全てのテキストエリア要素を調査
    console.log('=== テキストエリア要素一覧 ===');
    const textareas = await page.locator('textarea').all();
    console.log(`テキストエリア要素数: ${textareas.length}`);
    
    for (let i = 0; i < textareas.length; i++) {
      const textarea = textareas[i];
      const name = await textarea.getAttribute('name').catch(() => 'unknown');
      const placeholder = await textarea.getAttribute('placeholder').catch(() => 'unknown');
      const id = await textarea.getAttribute('id').catch(() => 'unknown');
      const className = await textarea.getAttribute('class').catch(() => 'unknown');
      
      console.log(`Textarea ${i}: name=${name}, placeholder=${placeholder}, id=${id}, class=${className}`);
    }
    
    // contenteditable要素を調査
    console.log('=== Contenteditable要素一覧 ===');
    const editables = await page.locator('[contenteditable="true"]').all();
    console.log(`Contenteditable要素数: ${editables.length}`);
    
    for (let i = 0; i < editables.length; i++) {
      const editable = editables[i];
      const className = await editable.getAttribute('class').catch(() => 'unknown');
      const id = await editable.getAttribute('id').catch(() => 'unknown');
      const role = await editable.getAttribute('role').catch(() => 'unknown');
      
      console.log(`Contenteditable ${i}: class=${className}, id=${id}, role=${role}`);
    }
    
    // ボタン要素を調査
    console.log('=== ボタン要素一覧 ===');
    const buttons = await page.locator('button').all();
    console.log(`ボタン要素数: ${buttons.length}`);
    
    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      const button = buttons[i];
      const text = await button.textContent().catch(() => 'unknown');
      const type = await button.getAttribute('type').catch(() => 'unknown');
      const className = await button.getAttribute('class').catch(() => 'unknown');
      
      console.log(`Button ${i}: text="${text}", type=${type}, class=${className}`);
    }
    
  } catch (debugError) {
    console.error('ページ構造調査エラー:', debugError.message);
  }
}

async function inputArticleContentAdvanced(page, article) {
  try {
    console.log('改善版記事内容入力を開始...');
    
    // より多くのセレクタパターンでタイトル入力を試行
    const titleSelectors = [
      'input[placeholder*="タイトル" i]',
      'input[name*="title" i]',
      'input[id*="title" i]',
      'input[class*="title" i]',
      'textarea[placeholder*="タイトル" i]',
      'div[contenteditable="true"][role="textbox"]',
      '[data-testid*="title"]',
      '.editor-title input',
      '.title-input',
      '.note-title input'
    ];

    console.log('タイトル入力を試行中...');
    let titleInputted = false;
    
    for (const selector of titleSelectors) {
      try {
        const elements = await page.locator(selector).all();
        for (const element of elements) {
          if (await element.isVisible({ timeout: 1000 })) {
            await element.click();
            await page.waitForTimeout(500);
            await element.fill(article.title);
            console.log(`タイトル入力成功: ${selector} - "${article.title}"`);
            titleInputted = true;
            break;
          }
        }
        if (titleInputted) break;
      } catch (e) {
        continue;
      }
    }

    // より多くのセレクタパターンで本文入力を試行
    const contentSelectors = [
      'div[contenteditable="true"]',
      'textarea[placeholder*="本文" i]',
      'textarea[name*="content" i]',
      'textarea[id*="content" i]',
      'textarea[class*="content" i]',
      '[data-testid*="editor"]',
      '[data-testid*="content"]',
      '.editor-content',
      '.note-editor textarea',
      '.note-content textarea',
      'textarea',
      '[role="textbox"]'
    ];

    console.log('本文入力を試行中...');
    const plainContent = convertMarkdownToPlainText(article.content);
    let contentInputted = false;
    
    for (const selector of contentSelectors) {
      try {
        const elements = await page.locator(selector).all();
        for (const element of elements) {
          if (await element.isVisible({ timeout: 1000 })) {
            await element.click();
            await page.waitForTimeout(500);
            
            // contenteditable の場合は特別処理
            if (selector.includes('contenteditable')) {
              await element.clear();
              await page.keyboard.type(plainContent, { delay: 10 });
            } else {
              await element.fill(plainContent);
            }
            
            console.log(`本文入力成功: ${selector}`);
            contentInputted = true;
            break;
          }
        }
        if (contentInputted) break;
      } catch (e) {
        continue;
      }
    }

    if (!titleInputted && !contentInputted) {
      console.log('タイトルと本文の両方の入力に失敗しました');
      return false;
    } else if (!titleInputted) {
      console.log('タイトル入力に失敗しましたが、本文入力は成功しました');
    } else if (!contentInputted) {
      console.log('本文入力に失敗しましたが、タイトル入力は成功しました');
    } else {
      console.log('タイトルと本文の両方の入力に成功しました');
    }

    // 入力完了後、少し待機
    await page.waitForTimeout(3000);
    return true;

  } catch (inputError) {
    console.error('記事内容入力エラー:', inputError.message);
    return false;
  }
}

async function executePostAdvanced(page, isPublished) {
  try {
    console.log(`${isPublished === 'true' ? '公開' : '下書き保存'}処理を実行中...`);
    
    // より多くのボタンパターンを試行
    const actionSelectors = isPublished === 'true' ? [
      'button:has-text("公開する")',
      'button:has-text("公開")',
      'button:has-text("投稿する")',
      'button:has-text("発行")',
      'button[data-testid*="publish"]',
      'button[class*="publish"]',
      '.publish-button',
      'input[type="submit"][value*="公開"]'
    ] : [
      'button:has-text("下書き保存")',
      'button:has-text("保存")',
      'button:has-text("下書き")',
      'button[data-testid*="save"]',
      'button[class*="save"]',
      '.save-button',
      'input[type="submit"][value*="保存"]'
    ];

    let actionExecuted = false;
    
    for (const selector of actionSelectors) {
      try {
        const elements = await page.locator(selector).all();
        for (const element of elements) {
          if (await element.isVisible({ timeout: 2000 }) && await element.isEnabled()) {
            await element.click();
            console.log(`${isPublished === 'true' ? '公開' : '保存'}ボタンクリック成功: ${selector}`);
            actionExecuted = true;
            break;
          }
        }
        if (actionExecuted) break;
      } catch (e) {
        continue;
      }
    }

    if (!actionExecuted) {
      console.log(`${isPublished === 'true' ? '公開' : '保存'}ボタンが見つかりませんでした`);
      
      // フォーム送信を試行
      try {
        await page.keyboard.press('Control+Enter'); // Ctrl+Enter で送信を試行
        console.log('Ctrl+Enterで送信を試行しました');
        actionExecuted = true;
      } catch (e) {
        console.log('Ctrl+Enter送信も失敗しました');
      }
    }

    if (actionExecuted) {
      // 処理完了を待機
      await page.waitForTimeout(5000);
      
      // 確認ダイアログがある場合の処理
      const confirmSelectors = [
        'button:has-text("確認")',
        'button:has-text("はい")',
        'button:has-text("OK")',
        'button:has-text("公開")'
      ];
      
      for (const selector of confirmSelectors) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            await element.click();
            console.log(`確認ボタンクリック: ${selector}`);
            await page.waitForTimeout(3000);
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }

    console.log(`${isPublished === 'true' ? '公開' : '下書き保存'}処理完了`);
    return actionExecuted;

  } catch (postError) {
    console.error('投稿実行エラー:', postError.message);
    return false;
  }
}

async function saveSuccessResult(article, url, isPublished) {
  const result = {
    success: true,
    article_url: url,
    title: article.title,
    published: isPublished === 'true',
    timestamp: new Date().toISOString(),
    message: 'note.comへの投稿が完了しました！'
  };
  
  fs.writeFileSync('post_result.json', JSON.stringify(result, null, 2));
  fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
  
  console.log('投稿成功結果を保存しました');
}

async function saveArticleToFile(article, isPublished, error = null) {
  const result = {
    success: false,
    error: error || '自動投稿に失敗。手動投稿が必要',
    article: {
      title: article.title,
      content: article.content,
      summary: article.summary || '',
      tags: article.tags || []
    },
    instructions: [
      '手動でnote.comに投稿してください:',
      '1. https://note.com/note/new にアクセス',
      '2. 以下の内容を貼り付け',
      `   タイトル: ${article.title}`,
      '   本文: generated_article.md の内容を参照',
      `   公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`
    ],
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync('post_result.json', JSON.stringify(result, null, 2));
  fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
  
  console.log('記事内容を generated_article.md に保存しました');
  console.log('手動投稿用の指示を post_result.json に保存しました');
}

function convertMarkdownToPlainText(markdown) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '') // 見出し記号除去
    .replace(/\*\*(.*?)\*\*/g, '$1') // 太字除去
    .replace(/\*(.*?)\*/g, '$1') // 斜体除去
    .replace(/`(.*?)`/g, '$1') // インラインコード除去
    .replace(/\n\n+/g, '\n\n') // 連続改行を整理
    .trim();
}

// コマンドライン引数から値を取得
const [,, topic, targetAudience, keywords, experience, isPublished] = process.argv;

if (!topic || !targetAudience || !keywords || !experience || !isPublished) {
  console.error('使用法: node post.mjs <topic> <targetAudience> <keywords> <experience> <isPublished>');
  process.exit(1);
}

// 投稿実行
postToNote(topic, targetAudience, keywords, experience, isPublished)
  .then((success) => {
    console.log('=== note.com処理完了 ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('=== note.com処理エラー ===', error);
    process.exit(0);
  });
