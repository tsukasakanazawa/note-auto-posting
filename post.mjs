import puppeteer from 'puppeteer';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function postToNote(title, content) {
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // 直接投稿ページに移動（ログイン状態を使用）
    console.log('投稿ページに移動中...');
    await page.goto('https://note.com/post', { timeout: 30000 });
    await delay(10000);
    
    // ページのタイトルを確認
    const pageTitle = await page.title();
    console.log(`ページタイトル: ${pageTitle}`);
    
    // 現在のURLを確認
    const currentUrl = page.url();
    console.log(`現在のURL: ${currentUrl}`);
    
    // すべての入力要素を探す
    const inputs = await page.$$('input, textarea, [contenteditable]');
    console.log(`見つかった入力要素数: ${inputs.length}`);
    
    if (inputs.length > 0) {
      // 最初の入力要素にタイトル入力
      console.log('最初の入力要素にタイトル入力...');
      await inputs[0].click();
      await inputs[0].type(title);
      
      if (inputs.length > 1) {
        // 2番目の入力要素に本文入力
        console.log('2番目の入力要素に本文入力...');
        await inputs[1].click();
        await inputs[1].type(content);
      }
    }
    
    console.log('投稿処理完了');
    
  } catch (error) {
    console.error('エラー:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  try {
    // 固定のテスト内容で実行（AI生成スキップ）
    const title = 'テスト投稿';
    const content = 'これはテスト投稿です。';
    
    console.log('投稿テスト開始...');
    await postToNote(title, content);
    
  } catch (error) {
    console.error('実行エラー:', error);
    process.exit(1);
  }
}

main();

