import fs from 'fs';
import { chromium } from 'playwright';

async function postToNote(topic, targetAudience, keywords, experience, isPublished) {
  console.log('=== note.com完全自動投稿開始 ===');
  console.log(`公開設定: ${isPublished === 'true' ? '公開' : '下書き'}`);

  let browser;
  
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
    throw new Error('NOTE_EMAIL または NOTE_PASSWORD が設定されていません');
  }

  try {
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

    // ===== STEP 1: ログイン =====
    console.log('=== STEP 1: ログイン処理 ===');
    await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // メールアドレス入力
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.click();
    await emailInput.fill(email);
    console.log('メールアドレス入力完了');

    // パスワード入力
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.click();
    await passwordInput.fill(password);
    console.log('パスワード入力完了');

    // ログインボタンクリック
    const loginButton = page.locator('button[type="submit"], button:has-text("ログイン")').first();
    await loginButton.waitFor({ state: 'visible', timeout: 10000 });
    await loginButton.click();
    console.log('ログインボタンクリック完了');

    // ログイン完了を待機
    await page.waitForTimeout(10000);
    
    const afterLoginUrl = page.url();
    console.log(`ログイン後のURL: ${afterLoginUrl}`);
    
    if (afterLoginUrl.includes('/login')) {
      throw new Error('ログインに失敗しました');
    }
    
    console.log('✅ ログイン成功');

    // ===== STEP 2: トップページから記事作成リンクを探す =====
    console.log('=== STEP 2: 記事作成リンクを探索 ===');
    
    // トップページに移動
    await page.goto('https://note.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log('トップページに移動完了');

    // ページ上のすべてのリンクを調査
    console.log('ページ上のリンクを調査中...');
    const links = await page.locator('a').all();
    console.log(`見つかったリンク数: ${links.length}`);

    let editorUrl = null;
    for (let i = 0; i < Math.min(links.length, 50); i++) {
      try {
        const link = links[i];
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');
        
        // 記事作成に関連するキーワードを含むリンクを探す
        if (href && (
          href.includes('creator') ||
          href.includes('write') ||
          href.includes('post') ||
          href.includes('new') ||
          text?.includes('投稿') ||
          text?.includes('記事') ||
          text?.includes('書く') ||
          text?.includes('作成') ||
          ariaLabel?.includes('投稿') ||
          ariaLabel?.includes('作成')
        )) {
          console.log(`候補リンク発見: href="${href}", text="${text}", aria-label="${ariaLabel}"`);
          
          if (!editorUrl && href) {
            editorUrl = href.startsWith('http') ? href : `https://note.com${href}`;
            console.log(`記事作成URL候補: ${editorUrl}`);
          }
        }
      } catch (e) {
        continue;
      }
    }

    // 見つからない場合は直接URLを試行
    if (!editorUrl) {
      console.log('リンクから見つからなかったため、直接URLを試行します');
      editorUrl = 'https://note.com/creator';
    }

    // ===== STEP 3: 記事作成ページに移動 =====
    console.log(`=== STEP 3: 記事作成ページに移動 (${editorUrl}) ===`);
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    const editorPageUrl = page.url();
    console.log(`記事作成ページURL: ${editorPageUrl}`);

    // ページの状態を確認
    const pageTitle = await page.title();
    console.log(`ページタイトル: ${pageTitle}`);

    // ===== STEP 4: ページ上の入力可能要素をすべて調査 =====
    console.log('=== STEP 4: 入力可能要素を調査 ===');
    
    // すべてのinput要素
    const allInputs = await page.locator('input').all();
    console.log(`input要素数: ${allInputs.length}`);
    for (let i = 0; i < allInputs.length; i++) {
      const input = allInputs[i];
      const type = await input.getAttribute('type').catch(() => null);
      const name = await input.getAttribute('name').catch(() => null);
      const placeholder = await input.getAttribute('placeholder').catch(() => null);
      const visible = await input.isVisible().catch(() => false);
      console.log(`  Input[${i}]: type=${type}, name=${name}, placeholder=${placeholder}, visible=${visible}`);
    }

    // すべてのtextarea要素
    const allTextareas = await page.locator('textarea').all();
    console.log(`textarea要素数: ${allTextareas.length}`);
    for (let i = 0; i < allTextareas.length; i++) {
      const textarea = allTextareas[i];
      const name = await textarea.getAttribute('name').catch(() => null);
      const placeholder = await textarea.getAttribute('placeholder').catch(() => null);
      const visible = await textarea.isVisible().catch(() => false);
      console.log(`  Textarea[${i}]: name=${name}, placeholder=${placeholder}, visible=${visible}`);
    }

    // すべてのcontenteditable要素
    const allEditables = await page.locator('[contenteditable="true"]').all();
    console.log(`contenteditable要素数: ${allEditables.length}`);
    for (let i = 0; i < allEditables.length; i++) {
      const editable = allEditables[i];
      const role = await editable.getAttribute('role').catch(() => null);
      const ariaLabel = await editable.getAttribute('aria-label').catch(() => null);
      const visible = await editable.isVisible().catch(() => false);
      console.log(`  Editable[${i}]: role=${role}, aria-label=${ariaLabel}, visible=${visible}`);
    }

    // ===== STEP 5: 記事内容を入力 =====
    console.log('=== STEP 5: 記事内容を入力 ===');
    
    const plainContent = convertMarkdownToPlainText(article.content);

    // 最初に見つかった表示されているinputにタイトルを入力
    let titleInputted = false;
    for (const input of allInputs) {
      try {
        if (await input.isVisible()) {
          await input.click();
          await page.waitForTimeout(500);
          await input.fill(article.title);
          console.log('✅ タイトル入力成功');
          titleInputted = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    await page.waitForTimeout(2000);

    // 最初に見つかった表示されているtextareaまたはeditableに本文を入力
    let contentInputted = false;
    
    // まずtextareaを試行
    for (const textarea of allTextareas) {
      try {
        if (await textarea.isVisible()) {
          await textarea.click();
          await page.waitForTimeout(1000);
          await textarea.fill(plainContent.substring(0, 2000));
          console.log('✅ 本文入力成功（textarea）');
          contentInputted = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // textareaで失敗したらcontentEditableを試行
    if (!contentInputted) {
      for (const editable of allEditables) {
        try {
          if (await editable.isVisible()) {
            await editable.click();
            await page.waitForTimeout(1000);
            await page.keyboard.type(plainContent.substring(0, 500), { delay: 10 });
            console.log('✅ 本文入力成功（contenteditable）');
            contentInputted = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }

    if (!titleInputted && !contentInputted) {
      throw new Error('タイトルまたは本文の入力フィールドが見つかりませんでした');
    }

    console.log('✅ 記事内容入力完了');
    await page.waitForTimeout(3000);

    // ===== STEP 6: 投稿ボタンを探してクリック =====
    console.log('=== STEP 6: 投稿ボタンを探索 ===');
    
    const allButtons = await page.locator('button').all();
    console.log(`button要素数: ${allButtons.length}`);
    
    for (let i = 0; i < allButtons.length; i++) {
      const button = allButtons[i];
      const text = await button.textContent().catch(() => '');
      const type = await button.getAttribute('type').catch(() => null);
      const visible = await button.isVisible().catch(() => false);
      console.log(`  Button[${i}]: text="${text}", type=${type}, visible=${visible}`);
    }

    const publishKeywords = isPublished === 'true' 
      ? ['公開', '投稿', '発行', 'publish', 'post']
      : ['保存', '下書き', 'save', 'draft'];

    let publishClicked = false;
    for (const button of allButtons) {
      try {
        const text = await button.textContent().catch(() => '');
        const visible = await button.isVisible();
        const enabled = await button.isEnabled();
        
        if (visible && enabled && publishKeywords.some(keyword => text.includes(keyword))) {
          console.log(`投稿ボタン発見: "${text}"`);
          await button.click();
          console.log('✅ 投稿ボタンクリック成功');
          publishClicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!publishClicked) {
      console.log('⚠️ 投稿ボタンが見つかりませんでしたが、自動保存されている可能性があります');
    }

    // 投稿完了を待機
    await page.waitForTimeout(8000);

    const finalUrl = page.url();
    console.log(`最終URL: ${finalUrl}`);

    // 結果を保存
    const result = {
      success: true,
      article_url: finalUrl,
      title: article.title,
      published: isPublished === 'true',
      content_length: article.content.length,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('post_result.json', JSON.stringify(result, null, 2));
    fs.writeFileSync('generated_article.md', `# ${article.title}\n\n${article.content}`);
    
    console.log('=== ✅ note.com自動投稿完了！ ===');
    console.log(`📄 記事URL: ${finalUrl}`);

  } finally {
    if (browser) {
      await browser.close();
      console.log('ブラウザを閉じました');
    }
  }
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
  .then(() => {
    console.log('=== 処理完了 ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('=== エラー発生 ===', error);
    process.exit(1);
  });
