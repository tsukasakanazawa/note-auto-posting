import puppeteer from 'puppeteer';
import { generateArticle } from './ai-writer.mjs';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadStorageState() {
  try {
    const stateJson = process.env.NOTE_STORAGE_STATE_JSON;
    if (!stateJson) {
      throw new Error('NOTE_STORAGE_STATE_JSON環境変数が設定されていません');
    }
    return JSON.parse(stateJson);
  } catch (error) {
    console.error('ストレージ状態の読み込みエラー:', error);
    throw error;
  }
}

async function postToNote(title, content) {
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // セッション状態の復元
    console.log('セッション状態復元開始');
    const storageState = await loadStorageState();
    console.log('セッション状態読み込み成功');
    
    await page.evaluateOnNewDocument((state) => {
      if (state.localStorage) {
        for (const [key, value] of Object.entries(state.localStorage)) {
          localStorage.setItem(key, value);
        }
      }
      if (state.sessionStorage) {
        for (const [key, value] of Object.entries(state.sessionStorage)) {
          sessionStorage.setItem(key, value);
        }
      }
    }, storageState);
    
    if (storageState.cookies) {
      await page.setCookie(...storageState.cookies);
    }
    console.log('セッション状態復元完了');
    
    // 投稿ページに移動
    console.log('投稿ページ移動開始');
    await page.goto('https://note.com/post', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    console.log('投稿ページ移動完了');
    await delay(10000);
    
    // 詳細デバッグ情報
    const currentUrl = page.url();
    const pageTitle = await page.title();
    console.log('ページ情報');
    console.log('URL: ' + currentUrl);
    console.log('タイトル: ' + pageTitle);
    
    // ページ内容を取得
    const bodyText = await page.evaluate(() => {
      return document.body ? document.body.innerText.substring(0, 500) : 'body要素なし';
    });
    console.log('ページ内容（最初の500文字）');
    console.log(bodyText);
    
    // ログイン状態確認
    if (currentUrl.includes('login')) {
      console.log('エラー: ログインページにリダイレクトされました');
      throw new Error('セッション状態が無効です');
    }
    
    if (!currentUrl.includes('post')) {
      console.log('エラー: 投稿ページではありません');
      throw new Error('投稿ページに到達できていません');
    }
    
    console.log('成功: 投稿ページに到達しました');
    
    // 入力要素の詳細調査
    console.log('入力要素調査開始');
    const allElements = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable]'));
      return inputs.map((el, index) => ({
        index: index,
        tagName: el.tagName,
        type: el.type || 'N/A',
        placeholder: el.placeholder || 'N/A',
        contentEditable: el.contentEditable || 'N/A',
        className: el.className || 'N/A',
        visible: el.offsetParent !== null
      }));
    });
    
    console.log('見つかった要素:');
    allElements.forEach(el => {
      console.log('要素' + el.index + ': ' + el.tagName + ' type="' + el.type + '" placeholder="' + el.placeholder + '" visible=' + el.visible);
    });
    
    if (allElements.length < 2) {
      throw new Error('入力要素が不足しています。見つかった数: ' + allElements.length);
    }
    
    // 実際の投稿テスト
    console.log('投稿テスト開始');
    const inputs = await page.$$('input, textarea, [contenteditable]');
    
    // タイトル入力
    console.log('タイトル入力テスト...');
    await inputs[0].click();
    await delay(2000);
    await page.type(inputs[0], title, { delay: 100 });
    console.log('タイトル入力完了');
    
    await delay(3000);
    
    // 本文入力
    console.log('本文入力テスト...');
    await inputs[1].click();
    await delay(2000);
    await page.type(inputs[1], content, { delay: 50 });
    console.log('本文入力完了');
    
    await delay(5000);
    
    // 入力後の確認
    const titleValue = await page.evaluate(el => el.value || el.textContent, inputs[0]);
    const contentValue = await page.evaluate(el => el.value || el.textContent, inputs[1]);
    console.log('入力確認 - タイトル: "' + titleValue.substring(0, 50) + '..."');
    console.log('入力確認 - 本文: "' + contentValue.substring(0, 100) + '..."');
    
    // 保存ボタン詳細調査
    console.log('保存ボタン調査');
    const buttons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.map((btn, index) => ({
        index: index,
        text: btn.textContent?.trim() || 'テキストなし',
        visible: btn.offsetParent !== null,
        disabled: btn.disabled
      }));
    });
    
    console.log('見つかったボタン:');
    buttons.forEach(btn => {
      console.log('ボタン' + btn.index + ': "' + btn.text + '" visible=' + btn.visible + ' disabled=' + btn.disabled);
    });
    
    if (buttons.length > 0) {
      console.log('最初のボタンをクリックします...');
      const buttonElements = await page.$$('button');
      await buttonElements[0].click();
      console.log('ボタンクリック完了');
      await delay(10000);
    }
    
    // 最終URL確認
    const finalUrl = page.url();
    console.log('最終URL: ' + finalUrl);
    
    console.log('投稿処理完了');
    
  } catch (error) {
    console.error('エラー発生');
    console.error('エラー:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  try {
    // テスト用固定値（まずはAI生成なしで）
    const title = 'テスト投稿 - ' + new Date().toLocaleString();
    const content = 'これはデバッグ用のテスト投稿です。現在時刻: ' + new Date().toLocaleString();
    
    console.log('デバッグモード開始');
    console.log('投稿予定タイトル: ' + title);
    console.log('投稿予定本文: ' + content);
    
    await postToNote(title, content);
    
  } catch (error) {
    console.error('メイン処理エラー');
    console.error('実行エラー:', error);
    process.exit(1);
  }
}

main();
