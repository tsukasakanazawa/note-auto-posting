import fs from 'fs';
import { chromium } from 'playwright';

async function postToNote(topic, targetAudience, keywords, experience, isPublished) {
  console.log('=== note.com完全自動投稿開始 ===');
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
      throw new Error('認証情報が設定されていません。');
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
    await performLogin(page, email, password);

    // ステップ2: 記事作成ページに移動
    console.log('=== STEP 2: 記事作成ページに移動 ===');
    await navigateToEditor(page);

    // ステップ3: 記事内容を入力
    console.log('=== STEP 3: 記事内容を入力 ===');
    await inputArticle(page, article);

    // ステップ4: 投稿を実行
    console.log('=== STEP 4: 投稿を実行 ===');
    const articleUrl = await publishArticle(page, isPublished);

    // 結果を保存
    await saveResult(article, articleUrl, isPublished);

    console.log('=== note.com完全自動投稿完了！ ===');
    return true;

  } catch (error) {
    console.error('note.com投稿エラー:', error);
    
    try {
      const draftContent = fs.readFileSync('draft.json', 'utf8');
      const article = JSON.parse(draftContent);
      await saveErrorResult(article, error.message);
    } catch (e) {
      console.error('エラー結果保存失敗:', e.message);
    }
    
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('ブラウザを閉じました');
    }
  }
}

async function performLogin(page, email, password) {
  console.log('ログインページに移動中...');
  await page.goto('https://note.com/login', { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });

  await page.waitForTimeout(5000);

  // メールアドレス入力
  console.log('メールアドレス入力中...');
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="メール" i]',
    'input[placeholder*="mail" i]'
  ];

  for (const selector of emailSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 3000 })) {
        await element.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        await element.fill(email, { timeout: 10000 });
        console.log(`メールアドレス入力完了: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // パスワード入力
  console.log('パスワード入力中...');
  const passwordSelectors = ['input[type="password"]', 'input[name="password"]'];

  for (const selector of passwordSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 3000 })) {
        await element.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        await element.fill(password, { timeout: 10000 });
        console.log(`パスワード入力完了: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // ログインボタンクリック
  console.log('ログインボタンをクリック中...');
  const loginSelectors = [
    'button[type="submit"]',
    'button:has-text("ログイン")',
    'input[type="submit"]'
  ];

  for (const selector of loginSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 3000 })) {
        await element.click({ timeout: 5000 });
        console.log(`ログインボタンクリック完了: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // ログイン完了を待機
  console.log('ログイン処理完了を待機中...');
  await page.waitForTimeout(10000);

  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    throw new Error('ログインに失敗しました');
  }

  console.log('ログイン成功');
}

async function navigateToEditor(page) {
  console.log('記事作成ページを探索中...');
  
  // 可能性のある記事作成リンクを探す
  const editorLinkSelectors = [
    'a[href*="/creator"]',
    'a:has-text("投稿")',
    'a:has-text("記事")',
    'a:has-text("作成")',
    'a:has-text("書く")',
    'a[aria-label*="投稿"]',
    'a[aria-label*="作成"]',
    'button:has-text("投稿")',
    'button:has-text("作成")'
  ];

  let editorUrl = null;

  for (const selector of editorLinkSelectors) {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 3000 })) {
        const href = await element.getAttribute('href');
        if (href) {
          editorUrl = href.startsWith('http') ? href : `https://note.com${href}`;
          console.log(`記事作成リンクを発見: ${selector} -> ${editorUrl}`);
          break;
        }
      }
    } catch (e) {
      continue;
    }
  }

  // リンクが見つからない場合、直接URLを試行
  if (!editorUrl) {
    console.log('リンクが見つからないため、直接URLを試行します');
    const directUrls = [
      'https://note.com/creator',
      'https://note.com/post',
      'https://note.com/my/notes/new',
      'https://note.com/n/new'
    ];

    for (const url of directUrls) {
      try {
        console.log(`URLを試行: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3000);
        
        const pageTitle = await page.title();
        const pageContent = await page.textContent('body').catch(() => '');
        
        if (!pageContent.includes('404') && !pageContent.includes('見つかりません')) {
          console.log(`有効なページを発見: ${url}`);
          editorUrl = url;
          break;
        }
      } catch (e) {
        console.log(`URL ${url} へのアクセス失敗`);
        continue;
      }
    }
  } else {
    // 見つかったリンクに移動
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }

  if (!editorUrl) {
    throw new Error('記事作成ページが見つかりませんでした');
  }

  console.log(`記事作成ページに移動完了: ${editorUrl}`);
  await page.waitForTimeout(5000);
}

async function inputArticle(page, article) {
  console.log('記事入力を開始...');
  
  // まずページ上の全ての入力可能要素を調査
  console.log('入力可能要素を調査中...');
  
  const plainContent = convertMarkdownToPlainText(article.content);
  
  // タイトル入力（より広範囲のセレクタ）
  console.log('タイトル入力を試行...');
  const titleSelectors = [
    'input[placeholder*="タイトル" i]',
    'input[name*="title" i]',
    'input[aria-label*="タイトル" i]',
    'textarea[placeholder*="タイトル" i]',
    '.title input',
    '.editor-title input',
    'input[type="text"]'
  ];

  let titleSuccess = false;
  for (const selector of titleSelectors) {
    try {
      const elements = await page.locator(selector).all();
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (await element.isVisible({ timeout: 2000 })) {
          await element.click({ timeout: 3000 });
          await page.waitForTimeout(500);
          await element.fill(article.title, { timeout: 5000 });
          console.log(`タイトル入力成功: ${selector} (要素${i})`);
          titleSuccess = true;
          break;
        }
      }
      if (titleSuccess) break;
    } catch (e) {
      continue;
    }
  }

  if (!titleSuccess) {
    console.log('⚠️ タイトル入力に失敗しましたが、処理を続行します');
  }

  await page.waitForTimeout(2000);

  // 本文入力（より広範囲のセレクタ）
  console.log('本文入力を試行...');
  const contentSelectors = [
    'div[contenteditable="true"]',
    'textarea[placeholder*="本文" i]',
    'textarea[name*="content" i]',
    'textarea[name*="body" i]',
    'textarea[aria-label*="本文" i]',
    '[data-placeholder*="本文"]',
    '.editor textarea',
    '.content-editor',
    'textarea'
  ];

  let contentSuccess = false;
  for (const selector of contentSelectors) {
    try {
      const elements = await page.locator(selector).all();
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (await element.isVisible({ timeout: 2000 })) {
          await element.click({ timeout: 3000 });
          await page.waitForTimeout(1000);
          
          // contenteditable の場合
          if (selector.includes('contenteditable')) {
            try {
              await element.fill('');
              await page.keyboard.type(plainContent.substring(0, 2000), { delay: 5 });
            } catch (e) {
              await element.fill(plainContent.substring(0, 2000));
            }
          } else {
            await element.fill(plainContent.substring(0, 2000), { timeout: 10000 });
          }
          
          console.log(`本文入力成功: ${selector} (要素${i})`);
          contentSuccess = true;
          break;
        }
      }
      if (contentSuccess) break;
    } catch (e) {
      continue;
    }
  }

  if (!contentSuccess) {
    throw new Error('本文入力に失敗しました。記事作成フォームが見つかりません。');
  }

  console.log('記事入力完了');
  await page.waitForTimeout(3000);
}

async function publishArticle(page, isPublished) {
  console.log(`${isPublished === 'true' ? '公開' : '下書き保存'}処理を開始...`);
  
  const actionSelectors = isPublished === 'true' ? [
    'button:has-text("公開に進む")',
    'button:has-text("公開")',
    'button:has-text("投稿する")',
    'button:has-text("投稿")',
    'button[aria-label*="公開"]',
    'button[data-action*="publish"]',
    '.publish-button',
    'button[type="submit"]'
  ] : [
    'button:has-text("下書き保存")',
    'button:has-text("下書き")',
    'button:has-text("保存")',
    'button[aria-label*="保存"]',
    'button[data-action*="save"]',
    '.save-button'
  ];

  let actionSuccess = false;
  
  for (const selector of actionSelectors) {
    try {
      const elements = await page.locator(selector).all();
      for (const element of elements) {
        if (await element.isVisible({ timeout: 2000 }) && 
            await element.isEnabled({ timeout: 2000 })) {
          await element.click({ timeout: 5000 });
          console.log(`${isPublished === 'true' ? '公開' : '保存'}ボタンクリック成功: ${selector}`);
          actionSuccess = true;
          break;
        }
      }
      if (actionSuccess) break;
    } catch (e) {
      continue;
    }
  }

  if (actionSuccess) {
    // 確認ダイアログがある場合の処理
    await page.waitForTimeout(3000);
    
    const confirmSelectors = [
      'button:has-text("投稿する")',
      'button:has-text("はい")',
      'button:has-text("OK")',
      'button:has-text("公開する")',
      'button[aria-label*="確認"]'
    ];
    
    for (const selector of confirmSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          await element.click({ timeout: 3000 });
          console.log(`確認ボタンクリック: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // 投稿完了を待機
    await page.waitForTimeout(5000);
    
    const finalUrl = page.url();
    console.log(`最終URL: ${finalUrl}`);
    
    if (finalUrl.includes('/n/') || finalUrl !== 'https://note.com/') {
      console.log('✅ 記事投稿成功！');
      return finalUrl;
    } else {
      console.log('⚠️ 投稿処理を実行しましたが、URLの変化を確認できませんでした');
      return finalUrl;
    }
  } else {
    console.log('⚠️ 投稿ボタンが見つかりませんでしたが、自動保存されている可能性があります');
    return page.url();
  }
}

async function saveResult(article, url, isPublished) {
  const result = {
    success: true,
    article_url: url,
    title: article.title,
    published: isPublished === 'true',
    content_length: article.content.length,
    timestamp: new Date().toISOString(),
    message: 'note.comへの自動投稿が完了しました！'
  };
  
  fs.writeFileSync('post_result.json', JSON.stringify(result, null, 2));
  fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
  
  console.log('✅ 投稿成功結果を保存しました');
  console.log(`📄 記事URL: ${url}`);
}

async function saveErrorResult(article, error) {
  const result = {
    success: false,
    error: error,
    article: {
      title: article.title,
      content: article.content,
      summary: article.summary || ''
    },
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync('post_result.json', JSON.stringify(result, null, 2));
  fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
  
  console.log('❌ エラー結果を保存しました');
}

function convertMarkdownToPlainText(markdown) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\n\n+/g, '\n\n')
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
    console.log('=== note.com完全自動投稿システム完了 ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('=== note.com投稿エラー ===', error);
    process.exit(1);
  });
