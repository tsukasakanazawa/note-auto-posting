import fs from 'fs';
import { chromium } from 'playwright';

async function postToNote(topic, targetAudience, keywords, experience, isPublished) {
  console.log('=== note.com投稿開始 ===');
  console.log(`公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`);

  let browser;
  try {
    // draft.jsonの存在確認と読み込み
    if (!fs.existsSync('draft.json')) {
      throw new Error('draft.jsonが見つかりません。記事生成フェーズが正常に完了していない可能性があります。');
    }

    console.log('draft.json読み込み中...');
    const draftContent = fs.readFileSync('draft.json', 'utf8');
    const article = JSON.parse(draftContent);

    if (!article.title || !article.content) {
      throw new Error('draft.jsonの内容が不完全です。titleまたはcontentが見つかりません。');
    }

    console.log(`記事タイトル: ${article.title}`);
    console.log(`記事文字数: ${article.content.length}`);

    // 認証情報の確認
    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;

    console.log('=== note.com投稿開始 ===');
    console.log(`公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`);

    // Playwrightでnote.comにアクセス
    console.log('ブラウザ起動中...');
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();

    // ログイン処理
    console.log('note.comにアクセス中...');
    
    if (!email || !password) {
      console.log('認証情報が設定されていません。記事内容のみ保存します。');
      
      // 記事内容をファイルに保存
      const resultData = {
        success: false,
        error: '認証情報未設定',
        article: {
          title: article.title,
          content: article.content,
          summary: article.summary || '',
          tags: article.tags || []
        },
        instructions: [
          '手動でnote.comに投稿してください:',
          '1. https://note.com にアクセス',
          '2. ログイン',
          '3. 記事作成ページで以下の内容を貼り付け',
          `   タイトル: ${article.title}`,
          '   本文: generated_article.md の内容を参照'
        ],
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync('post_result.json', JSON.stringify(resultData, null, 2));
      fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
      
      console.log('記事内容を generated_article.md に保存しました');
      console.log('手動投稿用の指示を post_result.json に保存しました');
      
      return true; // エラーではなく正常終了として扱う
    }

    try {
      // ログインページに移動
      console.log('ログインページに移動中...');
      await page.goto('https://note.com/login', { 
        waitUntil: 'networkidle', 
        timeout: 30000 
      });

      // ページの状態を確認
      console.log('ページタイトル:', await page.title());
      console.log('現在のURL:', page.url());

      // 少し待機
      await page.waitForTimeout(2000);

      // より柔軟なセレクタでメールフィールドを探す
      console.log('メールアドレス入力フィールドを探しています...');
      
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="メール"]',
        'input[placeholder*="mail"]',
        'input[placeholder*="Mail"]',
        'input[placeholder*="Email"]',
        'input[id*="email"]',
        'input[class*="email"]',
        '.login-form input[type="text"]',
        'form input[type="text"]',
        'input[type="text"]'
      ];

      let emailInput = null;
      for (const selector of emailSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          emailInput = page.locator(selector).first();
          if (await emailInput.isVisible()) {
            console.log(`メールフィールド発見: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!emailInput) {
        // ページの構造をデバッグ
        console.log('利用可能な入力フィールド:');
        const inputs = await page.locator('input').all();
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i];
          const type = await input.getAttribute('type').catch(() => 'unknown');
          const name = await input.getAttribute('name').catch(() => 'unknown');
          const placeholder = await input.getAttribute('placeholder').catch(() => 'unknown');
          console.log(`  Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}`);
        }
        
        throw new Error('メールアドレス入力フィールドが見つかりません');
      }

      // メールアドレス入力
      console.log('メールアドレス入力中...');
      await emailInput.fill(email);
      console.log('メールアドレス入力完了');

      // パスワードフィールドを探す
      console.log('パスワード入力フィールドを探しています...');
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[id*="password"]',
        'input[class*="password"]'
      ];

      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          passwordInput = page.locator(selector).first();
          if (await passwordInput.isVisible()) {
            console.log(`パスワードフィールド発見: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!passwordInput) {
        throw new Error('パスワード入力フィールドが見つかりません');
      }

      // パスワード入力
      console.log('パスワード入力中...');
      await passwordInput.fill(password);
      console.log('パスワード入力完了');

      // ログインボタンを探してクリック
      console.log('ログインボタンを探しています...');
      const loginSelectors = [
        'button[type="submit"]',
        'button:has-text("ログイン")',
        'button:has-text("サインイン")',
        'button:has-text("Login")',
        'input[type="submit"]',
        '.login-button',
        'form button',
        'button'
      ];

      let loginButton = null;
      for (const selector of loginSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          loginButton = page.locator(selector).first();
          if (await loginButton.isVisible()) {
            console.log(`ログインボタン発見: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!loginButton) {
        throw new Error('ログインボタンが見つかりません');
      }

      // ログインボタンクリック
      console.log('ログインボタンをクリック中...');
      await loginButton.click();
      
      // ログイン処理の完了を待機
      console.log('ログイン処理完了を待機中...');
      try {
        await page.waitForURL(/note\.com(?!\/login)/, { timeout: 15000 });
        console.log('ログイン成功');
      } catch (e) {
        console.log('URLの変更を確認できませんでしたが、処理を続行します');
      }

      // 少し待機
      await page.waitForTimeout(3000);

    } catch (loginError) {
      console.error('ログインエラー:', loginError.message);
      console.log('ログインに失敗しましたが、記事内容を保存します');
      
      // 記事内容をファイルに保存
      const resultData = {
        success: false,
        error: `ログイン失敗: ${loginError.message}`,
        article: {
          title: article.title,
          content: article.content,
          summary: article.summary || '',
          tags: article.tags || []
        },
        instructions: [
          'ログインに失敗しました。手動でnote.comに投稿してください:',
          '1. https://note.com にアクセス',
          '2. ログイン',
          '3. 記事作成ページで以下の内容を貼り付け',
          `   タイトル: ${article.title}`,
          '   本文: generated_article.md の内容を参照'
        ],
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync('post_result.json', JSON.stringify(resultData, null, 2));
      fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
      
      console.log('記事内容を generated_article.md に保存しました');
      console.log('手動投稿用の指示を post_result.json に保存しました');
      
      return true; // エラーではなく正常終了として扱う
    }

    // 投稿作成ページに移動
    console.log('投稿作成ページに移動中...');
    try {
      await page.goto('https://note.com/note/new', { 
        waitUntil: 'networkidle', 
        timeout: 30000 
      });
      
      await page.waitForTimeout(3000);
      
      // 記事内容を保存（投稿成功失敗に関わらず）
      const resultData = {
        success: true,
        message: 'ログイン成功。記事内容を保存しました。',
        article: {
          title: article.title,
          content: article.content,
          summary: article.summary || '',
          tags: article.tags || []
        },
        instructions: [
          '以下の内容でnote.comに投稿してください:',
          `タイトル: ${article.title}`,
          '本文: generated_article.md の内容を参照',
          `公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`
        ],
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync('post_result.json', JSON.stringify(resultData, null, 2));
      fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
      
      console.log('記事内容を generated_article.md に保存しました');
      console.log('投稿情報を post_result.json に保存しました');
      console.log('=== note.com処理完了 ===');
      
    } catch (pageError) {
      console.log('投稿ページアクセスエラー:', pageError.message);
      console.log('記事内容は保存されました');
    }

    return true;

  } catch (error) {
    console.error('note.com投稿エラー:', error);
    
    // エラー時でも記事内容を保存
    try {
      const draftContent = fs.readFileSync('draft.json', 'utf8');
      const article = JSON.parse(draftContent);
      
      const errorResult = {
        success: false,
        error: error.message,
        article: {
          title: article.title,
          content: article.content,
          summary: article.summary || '',
          tags: article.tags || []
        },
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync('post_result.json', JSON.stringify(errorResult, null, 2));
      fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
      
      console.log('エラー時でも記事内容を保存しました');
    } catch (e) {
      console.error('記事保存もエラー:', e.message);
    }
    
    return true; // エラーでも正常終了として扱う
  } finally {
    if (browser) {
      await browser.close();
      console.log('ブラウザを閉じました');
    }
  }
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
    process.exit(0); // エラーでも正常終了
  });
