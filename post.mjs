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

    // Playwrightでnote.comにアクセス
    console.log('ブラウザ起動中...');
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();

    // ログイン処理
    console.log('note.comにアクセス中...');
    await page.goto('https://note.com/login', { waitUntil: 'networkidle' });

    // 認証状態の復元を試行
    const storageState = process.env.NOTE_STORAGE_STATE_JSON;
    if (storageState) {
      try {
        console.log('保存された認証状態を復元中...');
        const state = JSON.parse(storageState);
        await context.addCookies(state.cookies || []);
        localStorage = state.localStorage || {};
        
        // メインページに移動して認証確認
        await page.goto('https://note.com/', { waitUntil: 'networkidle' });
        
        // ログイン状態の確認
        const isLoggedIn = await page.locator('[data-testid="header-user-menu-button"]').isVisible({ timeout: 5000 }).catch(() => false);
        
        if (!isLoggedIn) {
          console.log('認証状態が無効です。再ログインします...');
          throw new Error('認証状態無効');
        } else {
          console.log('認証状態復元成功');
        }
      } catch (authError) {
        console.log('認証状態復元失敗、フォームログインを実行:', authError.message);
        await performFormLogin(page);
      }
    } else {
      console.log('認証状態が設定されていません。フォームログインを実行...');
      await performFormLogin(page);
    }

    // 投稿作成ページに移動
    console.log('投稿作成ページに移動中...');
    await page.goto('https://note.com/note/new', { waitUntil: 'networkidle' });

    // 記事入力
    console.log('記事内容入力中...');
    
    // タイトル入力
    const titleSelector = 'input[placeholder="タイトル"], input[data-testid="title-input"], .note-editor-title input';
    await page.waitForSelector(titleSelector, { timeout: 10000 });
    await page.fill(titleSelector, article.title);
    console.log('タイトル入力完了');

    // 本文入力
    const contentSelector = 'div[contenteditable="true"], .note-editor-content, [data-testid="editor-content"]';
    await page.waitForSelector(contentSelector, { timeout: 10000 });
    
    // マークダウンをHTMLに変換（簡易版）
    const htmlContent = convertMarkdownToHtml(article.content);
    await page.fill(contentSelector, htmlContent);
    console.log('本文入力完了');

    // 少し待機してから保存/公開
    await page.waitForTimeout(2000);

    if (isPublished === 'true') {
      // 公開
      console.log('記事を公開中...');
      const publishButton = 'button:has-text("公開する"), button[data-testid="publish-button"], .publish-button';
      await page.waitForSelector(publishButton, { timeout: 10000 });
      await page.click(publishButton);
      
      // 公開確認ダイアログがある場合
      const confirmButton = 'button:has-text("公開"), button:has-text("確認")';
      try {
        await page.waitForSelector(confirmButton, { timeout: 5000 });
        await page.click(confirmButton);
      } catch (e) {
        console.log('公開確認ダイアログはスキップされました');
      }
      
      console.log('記事公開完了');
    } else {
      // 下書き保存
      console.log('下書きとして保存中...');
      const saveButton = 'button:has-text("下書き保存"), button[data-testid="save-draft"], .save-draft-button';
      try {
        await page.waitForSelector(saveButton, { timeout: 10000 });
        await page.click(saveButton);
        console.log('下書き保存完了');
      } catch (e) {
        console.log('下書き保存ボタンが見つかりません。自動保存を期待します。');
      }
    }

    // 結果確認
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    
    if (currentUrl.includes('/n/')) {
      console.log('投稿成功！');
      console.log(`記事URL: ${currentUrl}`);
      
      // 結果をファイルに保存
      const result = {
        success: true,
        article_url: currentUrl,
        title: article.title,
        published: isPublished === 'true',
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync('post_result.json', JSON.stringify(result, null, 2));
      console.log('投稿結果をpost_result.jsonに保存しました');
      
    } else {
      throw new Error('投稿に失敗した可能性があります。URLが期待された形式ではありません。');
    }

    return true;

  } catch (error) {
    console.error('note.com投稿エラー:', error);
    console.error('エラー詳細:', error.stack);

    // エラー情報を保存
    const errorResult = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      parameters: { topic, targetAudience, keywords, experience, isPublished }
    };
    
    fs.writeFileSync('post_result.json', JSON.stringify(errorResult, null, 2));
    console.log('エラー情報をpost_result.jsonに保存しました');
    
    return false;
  } finally {
    if (browser) {
      await browser.close();
      console.log('ブラウザを閉じました');
    }
  }
}

async function performFormLogin(page) {
  console.log('フォームログイン開始...');
  
  const email = process.env.NOTE_EMAIL;
  const password = process.env.NOTE_PASSWORD;
  
  if (!email || !password) {
    throw new Error('NOTE_EMAIL または NOTE_PASSWORD が設定されていません');
  }
  
  // ログインページに移動
  await page.goto('https://note.com/login', { waitUntil: 'networkidle' });
  
  // メールアドレス入力
  const emailSelector = 'input[type="email"], input[name="email"], input[placeholder*="メール"]';
  await page.waitForSelector(emailSelector, { timeout: 10000 });
  await page.fill(emailSelector, email);
  
  // パスワード入力
  const passwordSelector = 'input[type="password"], input[name="password"]';
  await page.waitForSelector(passwordSelector, { timeout: 10000 });
  await page.fill(passwordSelector, password);
  
  // ログインボタンクリック
  const loginButton = 'button:has-text("ログイン"), button[type="submit"], .login-button';
  await page.click(loginButton);
  
  // ログイン完了を待機
  await page.waitForURL('https://note.com/', { timeout: 30000 });
  console.log('フォームログイン完了');
}

function convertMarkdownToHtml(markdown) {
  // 簡易的なマークダウン→HTML変換
  return markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.*)$/gm, '<p>$1</p>')
    .replace(/<p><h([1-6])>/g, '<h$1>')
    .replace(/<\/h([1-6])><\/p>/g, '</h$1>');
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
    if (success) {
      console.log('=== note.com投稿正常完了 ===');
      process.exit(0);
    } else {
      console.log('=== note.com投稿失敗 ===');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('=== note.com投稿エラー ===', error);
    process.exit(1);
  });

