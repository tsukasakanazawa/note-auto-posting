import { chromium } from 'playwright';
import fs from 'fs';

const STATE_PATH = './note-state.json';

// 環境変数から認証情報を取得
const NOTE_EMAIL = process.env.NOTE_EMAIL || '';
const NOTE_PASSWORD = process.env.NOTE_PASSWORD || '';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!NOTE_EMAIL || !NOTE_PASSWORD) {
    console.error('❌ NOTE_EMAIL または NOTE_PASSWORD が設定されていません');
    console.log('GitHub Repository Variables を確認してください');
    process.exit(1);
  }

  console.log(`🚀 自動ログイン開始: ${NOTE_EMAIL}`);
  
  const browser = await chromium.launch({ 
    headless: true, // GitHub Actionsでは headless: true
    args: ['--lang=ja-JP'] 
  });
  const context = await browser.newContext({ locale: 'ja-JP' });
  const page = await context.newPage();

  try {
    // note.comログインページへ
    await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded' });
    console.log('📄 ログインページを読み込み完了');

    // デバッグ用スクリーンショット
    await page.screenshot({ path: 'login-1-initial.png', fullPage: true });

    // メールアドレス入力（複数セレクタ対応）
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="メール"]',
      'input[placeholder*="email"]',
      '#email',
      '[data-testid*="email"]'
    ];

    let emailInput = null;
    for (const selector of emailSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        emailInput = page.locator(selector).first();
        console.log(`📧 メール入力欄発見: ${selector}`);
        break;
      }
    }

    if (!emailInput) {
      console.error('❌ メールアドレス入力欄が見つかりません');
      await page.screenshot({ path: 'login-error-no-email.png', fullPage: true });
      process.exit(1);
    }

    await emailInput.fill(NOTE_EMAIL);
    console.log('📧 メールアドレス入力完了');

    // パスワード入力（複数セレクタ対応）
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="パスワード"]',
      'input[placeholder*="password"]',
      '#password',
      '[data-testid*="password"]'
    ];

    let passwordInput = null;
    for (const selector of passwordSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        passwordInput = page.locator(selector).first();
        console.log(`🔐 パスワード入力欄発見: ${selector}`);
        break;
      }
    }

    if (!passwordInput) {
      console.error('❌ パスワード入力欄が見つかりません');
      await page.screenshot({ path: 'login-error-no-password.png', fullPage: true });
      process.exit(1);
    }

    await passwordInput.fill(NOTE_PASSWORD);
    console.log('🔐 パスワード入力完了');

    // デバッグ用スクリーンショット
    await page.screenshot({ path: 'login-2-after-input.png', fullPage: true });

    // ログインボタンをクリック（複数セレクタ対応）
    const loginButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("ログイン")',
      'button:has-text("Login")',
      'input[type="submit"]',
      '[data-testid*="login"]',
      '.login-button'
    ];

    let loginButton = null;
    for (const selector of loginButtonSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        loginButton = page.locator(selector).first();
        console.log(`🔘 ログインボタン発見: ${selector}`);
        break;
      }
    }

    if (!loginButton) {
      console.error('❌ ログインボタンが見つかりません');
      await page.screenshot({ path: 'login-error-no-button.png', fullPage: true });
      process.exit(1);
    }

    await loginButton.click();
    console.log('🔘 ログインボタンをクリック');

    // ログイン完了を待機（複数パターン対応）
    console.log('⏳ ログイン完了を待機中...');
    
    try {
      // メインページへの遷移を待機
      await Promise.race([
        page.waitForURL(/note\.com\/?$/, { timeout: 30000 }),
        page.waitForURL(/note\.com\/dashboard/, { timeout: 30000 }),
        page.waitForURL(/note\.com\/notes/, { timeout: 30000 })
      ]);
      console.log('✅ ログイン完了を検知！');
    } catch (error) {
      // エラーメッセージをチェック
      const errorMessages = [
        'text=メールアドレスまたはパスワードが間違っています',
        'text=ログインに失敗しました',
        'text=認証に失敗',
        '[data-testid*="error"]',
        '.error-message'
      ];

      let loginError = false;
      for (const errorSelector of errorMessages) {
        const count = await page.locator(errorSelector).count();
        if (count > 0) {
          console.error('❌ ログインエラー: 認証情報が間違っている可能性があります');
          loginError = true;
          break;
        }
      }

      if (!loginError) {
        console.log('⚠️ ログイン完了の自動検知に失敗しましたが、処理を続行します');
      } else {
        await page.screenshot({ path: 'login-error-auth-failed.png', fullPage: true });
        process.exit(1);
      }
    }

    // デバッグ用スクリーンショット
    await page.screenshot({ path: 'login-3-after-login.png', fullPage: true });

    // セッション状態を保存
    console.log('💾 ログイン状態を保存中...');
    await context.storageState({ path: STATE_PATH });
    console.log(`✅ ログイン状態を保存完了: ${STATE_PATH}`);

    // 保存されたファイルの内容を確認
    if (fs.existsSync(STATE_PATH)) {
      const stateContent = fs.readFileSync(STATE_PATH, 'utf8');
      const stateData = JSON.parse(stateContent);
      console.log(`📊 保存されたクッキー数: ${stateData.cookies?.length || 0}個`);
      console.log(`📊 保存されたオリジン数: ${stateData.origins?.length || 0}個`);
    }

  } catch (error) {
    console.error('❌ ログイン処理中にエラーが発生:', error.message);
    await page.screenshot({ path: 'login-error-general.png', fullPage: true });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
