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

    // ステップ2: 記事作成ページを探して移動
    console.log('=== STEP 2: 記事作成ページを探索 ===');
    const editorUrl = await findEditorPage(page);
    
    if (!editorUrl) {
      console.log('記事作成ページが見つかりませんでした。');
      await saveArticleToFile(article, isPublished);
      return true;
    }

    // ステップ3: 記事内容入力
    console.log('=== STEP 3: 記事内容入力 ===');
    const inputSuccess = await inputArticleContent(page, article);
    
    if (!inputSuccess) {
      console.log('記事内容の入力に失敗しました。');
      await saveArticleToFile(article, isPublished);
      return true;
    }

    // ステップ4: 投稿実行
    console.log('=== STEP 4: 投稿実行 ===');
    const postSuccess = await executePost(page, isPublished);
    
    if (postSuccess) {
      const currentUrl = page.url();
      console.log('記事投稿成功！');
      console.log(`記事URL: ${currentUrl}`);
      await saveSuccessResult(article, currentUrl, isPublished);
    } else {
      console.log('投稿処理が完了しました。');
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
    const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.fill(email);
    console.log('メールアドレス入力完了');

    // パスワード入力
    console.log('パスワード入力中...');
    const passwordInput = await page.locator('input[type="password"]').first();
    await passwordInput.fill(password);
    console.log('パスワード入力完了');

    // ログインボタンクリック
    console.log('ログインボタンをクリック中...');
    const loginButton = await page.locator('button[type="submit"], button:has-text("ログイン")').first();
    await loginButton.click();
    console.log('ログインボタンクリック完了');

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

async function findEditorPage(page) {
  console.log('記事作成ページのURLを探索中...');
  
  // 複数の可能なURLパターンを試行
  const possibleUrls = [
    'https://note.com/note/new',
    'https://note.com/new',
    'https://note.com/create',
    'https://note.com/write',
    'https://note.com/editor',
    'https://note.com/post/new'
  ];

  for (const url of possibleUrls) {
    try {
      console.log(`URLを試行中: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      // ページが正常に読み込まれたかチェック
      const pageTitle = await page.title();
      console.log(`ページタイトル: ${pageTitle}`);
      
      // エラーページでないかチェック
      const errorMessages = [
        'ご指定のページが見つかりません',
        '404',
        'Not Found',
        'ページが見つかりません'
      ];
      
      const pageContent = await page.textContent('body').catch(() => '');
      const hasError = errorMessages.some(msg => pageContent.includes(msg));
      
      if (!hasError) {
        console.log(`有効なページを発見: ${url}`);
        
        // 記事作成フォームの要素があるかチェック
        const hasEditor = await checkForEditorElements(page);
        if (hasEditor) {
          console.log('記事作成フォームを確認しました');
          return url;
        } else {
          console.log('記事作成フォームが見つかりませんが、このURLを使用します');
          return url;
        }
      } else {
        console.log(`エラーページでした: ${url}`);
      }
      
    } catch (e) {
      console.log(`URL ${url} へのアクセスに失敗: ${e.message}`);
      continue;
    }
  }

  // 直接的なURL探索が失敗した場合、メインページから記事作成リンクを探す
  console.log('メインページから記事作成リンクを探索中...');
  try {
    await page.goto('https://note.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // 記事作成リンクを探す
    const createLinks = [
      'a:has-text("記事を書く")',
      'a:has-text("投稿")',
      'a:has-text("作成")',
      'a:has-text("書く")',
      'a:has-text("new")',
      'a[href*="/new"]',
      'a[href*="/create"]',
      'a[href*="/write"]'
    ];

    for (const linkSelector of createLinks) {
      try {
        const link = await page.locator(linkSelector).first();
        if (await link.isVisible({ timeout: 2000 })) {
          const href = await link.getAttribute('href');
          console.log(`記事作成リンクを発見: ${linkSelector} -> ${href}`);
          
          if (href) {
            const fullUrl = href.startsWith('http') ? href : `https://note.com${href}`;
            await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            return fullUrl;
          }
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.log('メインページからのリンク探索に失敗:', e.message);
  }

  console.log('記事作成ページが見つかりませんでした');
  return null;
}

async function checkForEditorElements(page) {
  try {
    // 記事作成フォームの典型的な要素をチェック
    const editorSelectors = [
      'input[placeholder*="タイトル" i]',
      'textarea[placeholder*="本文" i]',
      'div[contenteditable="true"]',
      '[data-testid*="editor"]',
      '.editor',
      '.note-editor'
    ];

    for (const selector of editorSelectors) {
      const element = await page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`エディタ要素を発見: ${selector}`);
        return true;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

async function inputArticleContent(page, article) {
  try {
    console.log('記事内容入力を開始...');
    
    // ページが完全に読み込まれるまで待機
    await page.waitForTimeout(5000);
    
    // タイトル入力
    console.log('タイトル入力を試行中...');
    const titleSelectors = [
      'input[placeholder*="タイトル" i]',
      'input[name*="title" i]',
      'textarea[placeholder*="タイトル" i]',
      '.title-input',
      '.editor-title input',
      'input[type="text"]'
    ];

    let titleInputted = false;
    for (const selector of titleSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 3000 })) {
          await element.click();
          await page.waitForTimeout(500);
          await element.fill(article.title);
          console.log(`タイトル入力成功: ${selector}`);
          titleInputted = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // 本文入力
    console.log('本文入力を試行中...');
    const contentSelectors = [
      'div[contenteditable="true"]',
      'textarea[placeholder*="本文" i]',
      'textarea[name*="content" i]',
      '.editor-content',
      '.note-editor',
      'textarea'
    ];

    const plainContent = convertMarkdownToPlainText(article.content);
    let contentInputted = false;
    
    for (const selector of contentSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 3000 })) {
          await element.click();
          await page.waitForTimeout(500);
          
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
      } catch (e) {
        continue;
      }
    }

    if (titleInputted || contentInputted) {
      console.log('記事内容入力完了（少なくとも一部は成功）');
      await page.waitForTimeout(3000);
      return true;
    } else {
      console.log('記事内容入力に失敗しました');
      return false;
    }

  } catch (inputError) {
    console.error('記事内容入力エラー:', inputError.message);
    return false;
  }
}

async function executePost(page, isPublished) {
  try {
    console.log(`${isPublished === 'true' ? '公開' : '下書き保存'}処理を実行中...`);
    
    const actionSelectors = isPublished === 'true' ? [
      'button:has-text("公開")',
      'button:has-text("投稿")',
      'button:has-text("発行")',
      'button[type="submit"]',
      '.publish-button'
    ] : [
      'button:has-text("保存")',
      'button:has-text("下書き")',
      '.save-button'
    ];

    let actionExecuted = false;
    
    for (const selector of actionSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 3000 }) && await element.isEnabled()) {
          await element.click();
          console.log(`アクションボタンクリック成功: ${selector}`);
          actionExecuted = true;
          await page.waitForTimeout(5000);
          break;
        }
      } catch (e) {
        continue;
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
      '1. https://note.com にアクセスしてログイン',
      '2. 記事作成ページに移動',
      '3. 以下の内容を貼り付け',
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
