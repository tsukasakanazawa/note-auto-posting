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

    if (!email || !password) {
      console.log('認証情報が設定されていません。記事内容のみ保存します。');
      await saveArticleToFile(article, isPublished);
      return true;
    }

    // Playwrightでnote.comにアクセス
    console.log('ブラウザ起動中...');
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-web-security'
      ]
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
      console.log('ログインに失敗しました。記事内容をファイルに保存します。');
      await saveArticleToFile(article, isPublished);
      return true;
    }

    // ステップ2: 記事作成ページに移動
    console.log('=== STEP 2: 記事作成ページに移動 ===');
    await page.goto('https://note.com/note/new', { 
      waitUntil: 'networkidle', 
      timeout: 30000 
    });
    
    await page.waitForTimeout(3000);
    console.log('記事作成ページにアクセス完了');

    // ステップ3: 記事内容入力
    console.log('=== STEP 3: 記事内容入力 ===');
    const inputSuccess = await inputArticleContent(page, article);
    
    if (!inputSuccess) {
      console.log('記事内容の入力に失敗しました。記事内容をファイルに保存します。');
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
      console.log('投稿は完了しましたが、確認できませんでした。');
      await saveArticleToFile(article, isPublished);
    }

    return true;

  } catch (error) {
    console.error('note.com投稿エラー:', error);
    
    // エラー時でも記事内容を保存
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
      waitUntil: 'networkidle', 
      timeout: 30000 
    });

    await page.waitForTimeout(2000);

    // メールアドレス入力
    console.log('メールアドレス入力中...');
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="メール"]',
      'input[placeholder*="mail" i]',
      'form input[type="text"]'
    ];

    let emailInputted = false;
    for (const selector of emailSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.fill(selector, email);
        console.log(`メールアドレス入力完了: ${selector}`);
        emailInputted = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!emailInputted) {
      throw new Error('メールアドレス入力フィールドが見つかりません');
    }

    // パスワード入力
    console.log('パスワード入力中...');
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]'
    ];

    let passwordInputted = false;
    for (const selector of passwordSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.fill(selector, password);
        console.log(`パスワード入力完了: ${selector}`);
        passwordInputted = true;
        break;
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
      'input[type="submit"]',
      'form button'
    ];

    let loginClicked = false;
    for (const selector of loginSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        console.log(`ログインボタンクリック完了: ${selector}`);
        loginClicked = true;
        break;
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
    
    // ログイン成功の確認
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

async function inputArticleContent(page, article) {
  try {
    console.log('記事フォーム要素を探しています...');
    
    // タイトル入力
    const titleSelectors = [
      'input[placeholder*="タイトル" i]',
      'input[name="title"]',
      'textarea[placeholder*="タイトル" i]',
      '.editor-title input',
      '.title-input'
    ];

    let titleInputted = false;
    for (const selector of titleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.fill(selector, article.title);
        console.log(`タイトル入力完了: ${article.title}`);
        titleInputted = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!titleInputted) {
      console.log('タイトル入力フィールドが見つかりませんでした');
    }

    // 本文入力
    console.log('本文入力中...');
    const contentSelectors = [
      'div[contenteditable="true"]',
      'textarea[placeholder*="本文" i]',
      'textarea[name="content"]',
      '.editor-content',
      '.note-editor textarea',
      'textarea'
    ];

    const plainContent = convertMarkdownToPlainText(article.content);
    
    let contentInputted = false;
    for (const selector of contentSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        
        // contenteditable の場合
        if (selector.includes('contenteditable')) {
          await page.click(selector);
          await page.waitForTimeout(1000);
          await page.keyboard.type(plainContent);
        } else {
          await page.fill(selector, plainContent);
        }
        
        console.log('本文入力完了');
        contentInputted = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!contentInputted) {
      console.log('本文入力フィールドが見つかりませんでした');
      return false;
    }

    // 入力完了後、少し待機
    await page.waitForTimeout(2000);
    console.log('記事内容入力完了');
    return true;

  } catch (inputError) {
    console.error('記事内容入力エラー:', inputError.message);
    return false;
  }
}

async function executePost(page, isPublished) {
  try {
    console.log(`${isPublished === 'true' ? '公開' : '下書き保存'}処理を実行中...`);
    
    if (isPublished === 'true') {
      // 公開ボタンを探してクリック
      const publishSelectors = [
        'button:has-text("公開する")',
        'button:has-text("公開")',
        'button[data-testid*="publish"]',
        '.publish-button',
        'button[type="submit"]'
      ];

      for (const selector of publishSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.click(selector);
          console.log('公開ボタンクリック完了');
          
          // 公開確認ダイアログの処理
          await page.waitForTimeout(2000);
          
          const confirmSelectors = [
            'button:has-text("公開")',
            'button:has-text("確認")',
            'button:has-text("はい")',
            'button:has-text("OK")'
          ];
          
          for (const confirmSelector of confirmSelectors) {
            try {
              await page.waitForSelector(confirmSelector, { timeout: 3000 });
              await page.click(confirmSelector);
              console.log('公開確認完了');
              break;
            } catch (e) {
              continue;
            }
          }
          
          break;
        } catch (e) {
          continue;
        }
      }
    } else {
      // 下書き保存
      const saveSelectors = [
        'button:has-text("下書き保存")',
        'button:has-text("保存")',
        'button[data-testid*="save"]',
        '.save-button'
      ];

      for (const selector of saveSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.click(selector);
          console.log('下書き保存ボタンクリック完了');
          break;
        } catch (e) {
          continue;
        }
      }
    }

    // 投稿処理完了を待機
    await page.waitForTimeout(5000);
    
    console.log(`${isPublished === 'true' ? '公開' : '下書き保存'}処理完了`);
    return true;

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
    error: error || '手動投稿が必要',
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
      '   本文: generated_article.md の内容を参照',
      `   公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`
    ],
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync('post_result.json', JSON.stringify(result, null, 2));
  fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
  
  console.log('記事内容を generated_article.md に保存しました');
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
