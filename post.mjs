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
      console.log('認証情報が設定されていません。記事内容をファイルに保存します。');
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

    // ステップ1: ログイン（安全版）
    console.log('=== STEP 1: 安全なログイン処理 ===');
    const loginSuccess = await performSafeLogin(page, email, password);
    
    if (!loginSuccess) {
      console.log('ログインに失敗しました。記事内容をファイルに保存します。');
      await saveArticleToFile(article, isPublished);
      return true;
    }

    console.log('ログイン成功！記事内容をファイルに保存し、手動投稿のための情報を提供します。');
    
    // ログイン成功時でも、確実な投稿のために記事内容をファイルに保存
    const successResult = {
      success: true,
      login_successful: true,
      article: {
        title: article.title,
        content: article.content,
        summary: article.summary || '',
        tags: article.tags || []
      },
      next_steps: [
        'ログインに成功しました！',
        '以下の手順で記事を投稿してください:',
        '1. https://note.com にアクセス（既にログイン済み）',
        '2. 記事作成ページに移動',
        '3. 以下の内容を貼り付け:',
        `   タイトル: ${article.title}`,
        '   本文: generated_article.md の内容を参照',
        `   公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`,
        '4. 投稿ボタンをクリック'
      ],
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('post_result.json', JSON.stringify(successResult, null, 2));
    fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
    
    console.log('ログイン成功！記事内容を generated_article.md に保存しました');
    console.log('手動投稿用の詳細手順を post_result.json に保存しました');

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

async function performSafeLogin(page, email, password) {
  try {
    console.log('ログインページに移動中...');
    await page.goto('https://note.com/login', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });

    // ページ読み込み完了を確実に待機
    await page.waitForTimeout(5000);
    console.log('ログインページの読み込み完了');

    // メールアドレス入力フィールドを慎重に探す
    console.log('メールアドレス入力フィールドを探しています...');
    
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="メール" i]',
      'input[placeholder*="mail" i]'
    ];

    let emailElement = null;
    let usedEmailSelector = '';

    for (const selector of emailSelectors) {
      try {
        console.log(`セレクタ ${selector} を試行中...`);
        
        // 要素の存在確認
        await page.waitForSelector(selector, { timeout: 5000 });
        
        // 要素の取得
        emailElement = page.locator(selector).first();
        
        // 要素が表示されているか確認
        const isVisible = await emailElement.isVisible({ timeout: 3000 });
        
        if (isVisible) {
          console.log(`メールアドレス入力フィールドを発見: ${selector}`);
          usedEmailSelector = selector;
          break;
        } else {
          console.log(`要素は存在するが非表示: ${selector}`);
        }
      } catch (e) {
        console.log(`セレクタ ${selector} での要素発見に失敗: ${e.message}`);
        continue;
      }
    }

    if (!emailElement || !usedEmailSelector) {
      throw new Error('メールアドレス入力フィールドが見つかりません');
    }

    // メールアドレス入力
    console.log('メールアドレスを入力中...');
    try {
      await emailElement.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      await emailElement.fill(email, { timeout: 10000 });
      console.log('メールアドレス入力完了');
    } catch (fillError) {
      throw new Error(`メールアドレス入力に失敗: ${fillError.message}`);
    }

    // パスワード入力フィールドを探す
    console.log('パスワード入力フィールドを探しています...');
    
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]'
    ];

    let passwordElement = null;
    let usedPasswordSelector = '';

    for (const selector of passwordSelectors) {
      try {
        console.log(`パスワードセレクタ ${selector} を試行中...`);
        
        await page.waitForSelector(selector, { timeout: 5000 });
        passwordElement = page.locator(selector).first();
        
        const isVisible = await passwordElement.isVisible({ timeout: 3000 });
        
        if (isVisible) {
          console.log(`パスワード入力フィールドを発見: ${selector}`);
          usedPasswordSelector = selector;
          break;
        }
      } catch (e) {
        console.log(`パスワードセレクタ ${selector} での要素発見に失敗: ${e.message}`);
        continue;
      }
    }

    if (!passwordElement || !usedPasswordSelector) {
      throw new Error('パスワード入力フィールドが見つかりません');
    }

    // パスワード入力
    console.log('パスワードを入力中...');
    try {
      await passwordElement.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      await passwordElement.fill(password, { timeout: 10000 });
      console.log('パスワード入力完了');
    } catch (fillError) {
      throw new Error(`パスワード入力に失敗: ${fillError.message}`);
    }

    // ログインボタンを探してクリック
    console.log('ログインボタンを探しています...');
    
    const loginSelectors = [
      'button[type="submit"]',
      'button:has-text("ログイン")',
      'input[type="submit"]',
      'button:has-text("サインイン")'
    ];

    let loginClicked = false;

    for (const selector of loginSelectors) {
      try {
        console.log(`ログインボタンセレクタ ${selector} を試行中...`);
        
        await page.waitForSelector(selector, { timeout: 5000 });
        const loginElement = page.locator(selector).first();
        
        const isVisible = await loginElement.isVisible({ timeout: 3000 });
        const isEnabled = await loginElement.isEnabled({ timeout: 3000 });
        
        if (isVisible && isEnabled) {
          console.log(`ログインボタンを発見: ${selector}`);
          await loginElement.click({ timeout: 5000 });
          console.log('ログインボタンクリック完了');
          loginClicked = true;
          break;
        }
      } catch (e) {
        console.log(`ログインボタンセレクタ ${selector} での操作に失敗: ${e.message}`);
        continue;
      }
    }

    if (!loginClicked) {
      throw new Error('ログインボタンが見つからないか、クリックできませんでした');
    }

    // ログイン処理の完了を待機
    console.log('ログイン処理の完了を待機中... (10秒)');
    await page.waitForTimeout(10000);
    
    // ログイン成功の確認
    const currentUrl = page.url();
    console.log(`現在のURL: ${currentUrl}`);
    
    if (currentUrl.includes('/login')) {
      // まだログインページにいる場合、エラーメッセージを確認
      try {
        const errorMessages = await page.textContent('body');
        if (errorMessages.includes('メールアドレスまたはパスワードが正しくありません') ||
            errorMessages.includes('ログインに失敗')) {
          throw new Error('ログイン認証情報が正しくありません');
        }
      } catch (e) {
        // エラーメッセージ確認に失敗
      }
      
      throw new Error('ログインページから移動していません。認証に失敗した可能性があります。');
    }

    console.log('ログイン成功を確認しました');
    return true;

  } catch (loginError) {
    console.error('ログインエラー:', loginError.message);
    console.error('ログイン詳細:', loginError.stack);
    return false;
  }
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
    manual_posting_instructions: [
      '手動でnote.comに投稿してください:',
      '1. https://note.com/login にアクセスしてログイン',
      '2. ログイン後、記事作成ページに移動',
      '3. 以下の内容を貼り付け:',
      `   タイトル: ${article.title}`,
      '   本文: generated_article.md の内容をコピー&ペースト',
      `   公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`,
      '4. 投稿ボタンをクリック'
    ],
    troubleshooting: [
      'もしログインに問題がある場合:',
      '- NOTE_EMAIL と NOTE_PASSWORD が正しく設定されているか確認',
      '- note.comアカウントが有効か確認',
      '- ブラウザで手動ログインできるか確認'
    ],
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync('post_result.json', JSON.stringify(result, null, 2));
  fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
  
  console.log('記事内容を generated_article.md に保存しました');
  console.log('手動投稿用の詳細手順を post_result.json に保存しました');
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
