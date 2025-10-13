import puppeteer from 'puppeteer';
import { generateArticle } from './ai-writer.mjs';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function postToNote(title, content, isPublic = false) {
  let browser = null;
  
  try {
    console.log('ブラウザ起動中...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    const page = await browser.newPage();
    
    // note.comにログイン
    console.log('note.comにログイン中...');
    await page.goto('https://note.com/login');
    await delay(5000);
    
    // メールアドレス入力
    await page.type('input[type="email"]', process.env.NOTE_EMAIL);
    await delay(2000);
    
    // パスワード入力
    await page.type('input[type="password"]', process.env.NOTE_PASSWORD);
    await delay(2000);
    
    // ログインボタンクリック
    await page.click('button[type="submit"]');
    await delay(10000);
    
    // 投稿ページに移動
    console.log('投稿ページに移動中...');
    await page.goto('https://note.com/post');
    await delay(10000);
    
    // 最初の入力欄にタイトル入力
    console.log('タイトル入力中...');
    const firstInput = 'input:first-of-type';
    await page.waitForSelector(firstInput, { timeout: 20000 });
    await page.click(firstInput);
    await page.type(firstInput, title);
    
    await delay(5000);
    
    // contenteditable要素に本文入力
    console.log('本文入力中...');
    const editor = '[contenteditable]';
    await page.waitForSelector(editor, { timeout: 20000 });
    await page.click(editor);
    await page.type(editor, content);
    
    await delay(10000);
    
    // 保存（最初のボタンをクリック）
    console.log('保存中...');
    const firstButton = 'button:first-of-type';
    await page.click(firstButton);
    
    await delay(5000);
    console.log('投稿完了！');
    
  } catch (error) {
    console.error('投稿エラー:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function main() {
  try {
    const theme = process.argv[3] || 'AI活用術';
    const target = process.argv[4] || 'ビジネスパーソン';
    const message = process.argv[5] || 'AIで生産性向上';
    const cta = process.argv[6] || '実際に試してみる';
    const isPublic = process.argv[7] === 'true';
    
    console.log('AI記事生成中...');
    const article = await generateArticle(theme, target, message, cta);
    
    const lines = article.split('\n').filter(line => line.trim());
    const title = lines[0].replace(/^#+\s*/, '');
    const content = lines.slice(1).join('\n').trim();
    
    console.log(`タイトル: ${title}`);
    console.log(`記事長: ${content.length}文字`);
    
    await postToNote(title, content, isPublic);
    
  } catch (error) {
    console.error('実行エラー:', error);
    process.exit(1);
  }
}

main();
