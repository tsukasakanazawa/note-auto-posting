import puppeteer from 'puppeteer';
import { generateArticle } from './ai-writer.mjs';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function postToNote(title, content) {
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    console.log('投稿ページに移動中...');
    await page.goto('https://note.com/post', { timeout: 30000 });
    await delay(10000);
    
    const inputs = await page.$$('input, textarea, [contenteditable]');
    console.log(`見つかった入力要素数: ${inputs.length}`);
    
    if (inputs.length > 0) {
      console.log('タイトル入力中...');
      await inputs[0].click();
      await inputs[0].type(title);
      
      if (inputs.length > 1) {
        console.log('本文入力中...');
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
    const mode = process.argv[2] || 'ai';
    
    if (mode === 'ai') {
      // AI記事生成モード
      const theme = process.argv[3] || 'AI活用術';
      const target = process.argv[4] || 'ビジネスパーソン';
      const message = process.argv[5] || 'AIで生産性向上';
      const cta = process.argv[6] || '実際に試してみる';
      
      console.log('AI記事生成中...');
      const article = await generateArticle(theme, target, message, cta);
      
      const lines = article.split('\n').filter(line => line.trim());
      const title = lines[0].replace(/^#+\s*/, '');
      const content = lines.slice(1).join('\n').trim();
      
      console.log(`生成タイトル: ${title}`);
      console.log(`記事長: ${content.length}文字`);
      
      await postToNote(title, content);
    } else {
      // テストモード
      await postToNote('テスト投稿', 'これはテスト投稿です。');
    }
    
  } catch (error) {
    console.error('実行エラー:', error);
    process.exit(1);
  }
}

main();
