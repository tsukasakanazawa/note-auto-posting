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
      await delay(3000);
      
      if (inputs.length > 1) {
        console.log('本文入力中...');
        await inputs[1].click();
        await inputs[1].type(content);
        await delay(5000);
      }
    }
    
    // 保存処理を追加
    console.log('保存ボタンを探しています...');
    const buttons = await page.$$('button');
    console.log(`見つかったボタン数: ${buttons.length}`);
    
    for (let i = 0; i < buttons.length; i++) {
      const buttonText = await page.evaluate(el => el.textContent, buttons[i]);
      console.log(`ボタン${i + 1}: ${buttonText}`);
      
      if (buttonText && (buttonText.includes('保存') || buttonText.includes('下書き') || buttonText.includes('公開'))) {
        console.log(`保存ボタン発見: ${buttonText}`);
        await buttons[i].click();
        await delay(5000);
        break;
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
