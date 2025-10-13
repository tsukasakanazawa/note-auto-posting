import puppeteer from 'puppeteer';
import fs from 'fs';

// 詳細なログ出力関数
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function postToNote() {
    let browser;
    try {
        log('ブラウザを起動中...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ],
            timeout: 60000
        });

        const page = await browser.newPage();
        
        // より詳細なログ設定
        page.on('console', msg => log(`ブラウザ: ${msg.text()}`));
        page.on('pageerror', error => log(`ページエラー: ${error.message}`));
        page.on('requestfailed', request => log(`リクエスト失敗: ${request.url()}`));

        // ユーザーエージェントを設定
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // ビューポートを設定
        await page.setViewport({ width: 1366, height: 768 });

        log('note.comにアクセス中...');
        await page.goto('https://note.com/', { 
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 30000 
        });

        log('ページロード完了');

        // セッション情報を復元
        const sessionData = process.env.NOTE_STORAGE_STATE_JSON;
        if (sessionData) {
            log('セッション情報を復元中...');
            try {
                const state = JSON.parse(sessionData);
                
                // LocalStorageを設定
                if (state.localStorage) {
                    await page.evaluate((localStorage) => {
                        for (const [key, value] of Object.entries(localStorage)) {
                            window.localStorage.setItem(key, value);
                        }
                    }, state.localStorage);
                }

                // Cookieを設定
                if (state.cookies && state.cookies.length > 0) {
                    await page.setCookie(...state.cookies);
                }

                log('セッション復元完了');
                
                // ページを再読み込みしてセッションを適用
                await page.reload({ waitUntil: 'networkidle0' });
                log('セッション適用のためのリロード完了');
            } catch (error) {
                log(`セッション復元エラー: ${error.message}`);
            }
        }

        // 記事を読み込み
        log('生成された記事を読み込み中...');
        const articleData = JSON.parse(fs.readFileSync('article.json', 'utf8'));
        log(`記事データ: タイトル="${articleData.title}", 本文長=${articleData.content.length}文字`);

        // 投稿ページに移動
        log('投稿ページに移動中...');
        await page.goto('https://note.com/n/new', { 
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 30000 
        });

        // ページの現在のURL確認
        const currentUrl = page.url();
        log(`現在のURL: ${currentUrl}`);

        // ログイン状態を確認
        if (currentUrl.includes('/signin') || currentUrl.includes('/login')) {
            throw new Error('ログインが必要です。セッション情報を確認してください。');
        }

        // DOMが完全に読み込まれるまで待機
        log('DOM読み込み待機中...');
        await page.waitForTimeout(3000);

        // 現在のページの構造を確認
        log('ページ構造を分析中...');
        const pageStructure = await page.evaluate(() => {
            // タイトル入力欄の候補を探す
            const titleSelectors = [
                'input[placeholder*="タイトル"]',
                'input[data-testid*="title"]',
                'textarea[placeholder*="タイトル"]',
                '.note-editor-title input',
                '[contenteditable="true"]'
            ];

            const results = {};
            titleSelectors.forEach((selector, index) => {
                const element = document.querySelector(selector);
                results[`selector_${index}`] = {
                    selector: selector,
                    found: !!element,
                    count: document.querySelectorAll(selector).length,
                    tagName: element ? element.tagName : null,
                    className: element ? element.className : null,
                    placeholder: element ? element.placeholder : null
                };
            });

            // すべてのinput要素を確認
            const allInputs = Array.from(document.querySelectorAll('input, textarea')).map(el => ({
                tagName: el.tagName,
                type: el.type,
                placeholder: el.placeholder,
                className: el.className,
                id: el.id,
                name: el.name
            }));

            return { titleSelectors: results, allInputs: allInputs };
        });

        log('ページ構造分析結果:');
        log(JSON.stringify(pageStructure, null, 2));

        // より柔軟なセレクタでタイトル入力欄を探す
        log('タイトル入力欄を探索中...');
        let titleInput = null;
        const titleSelectors = [
            'input[placeholder*="タイトル"]',
            'input[placeholder*="title"]',
            'textarea[placeholder*="タイトル"]',
            'input[data-testid*="title"]',
            '[contenteditable="true"]',
            '.note-editor input',
            '.editor-title input',
            'input[type="text"]'
        ];

        for (const selector of titleSelectors) {
            try {
                log(`セレクタ試行: ${selector}`);
                await page.waitForSelector(selector, { timeout: 5000 });
                titleInput = await page.$(selector);
                if (titleInput) {
                    log(`タイトル入力欄発見: ${selector}`);
                    break;
                }
            } catch (error) {
                log(`セレクタ失敗: ${selector} - ${error.message}`);
            }
        }

        if (!titleInput) {
            // 最後の手段：すべてのinput要素を試す
            log('すべてのinput要素を確認中...');
            const allInputs = await page.$$('input, textarea');
            for (let i = 0; i < allInputs.length; i++) {
                const inputInfo = await page.evaluate(el => ({
                    placeholder: el.placeholder,
                    type: el.type,
                    visible: el.offsetParent !== null
                }), allInputs[i]);
                
                log(`Input ${i}: ${JSON.stringify(inputInfo)}`);
                
                if (inputInfo.visible && (inputInfo.type === 'text' || !inputInfo.type)) {
                    titleInput = allInputs[i];
                    log(`タイトル入力欄として採用: Input ${i}`);
                    break;
                }
            }
        }

        if (!titleInput) {
            throw new Error('タイトル入力欄が見つかりません');
        }

        // タイトルを入力
        log('タイトルを入力中...');
        await titleInput.click();
        await page.waitForTimeout(1000);
        await titleInput.type(articleData.title, { delay: 100 });
        log('タイトル入力完了');

        // 本文入力欄を探す
        log('本文入力欄を探索中...');
        let contentArea = null;
        const contentSelectors = [
            '[contenteditable="true"]',
            '.editor-content',
            '.note-editor-content',
            'textarea',
            '.ql-editor',
            '[data-testid*="editor"]',
            '.editor .ql-editor'
        ];

        for (const selector of contentSelectors) {
            try {
                log(`本文セレクタ試行: ${selector}`);
                await page.waitForSelector(selector, { timeout: 5000 });
                const elements = await page.$$(selector);
                
                // タイトル以外の編集可能な要素を探す
                for (const element of elements) {
                    const isTitle = await page.evaluate((el, titleEl) => el === titleEl, element, titleInput);
                    if (!isTitle) {
                        contentArea = element;
                        log(`本文入力欄発見: ${selector}`);
                        break;
                    }
                }
                
                if (contentArea) break;
            } catch (error) {
                log(`本文セレクタ失敗: ${selector} - ${error.message}`);
            }
        }

        if (!contentArea) {
            throw new Error('本文入力欄が見つかりません');
        }

        // 本文を入力
        log('本文を入力中...');
        await contentArea.click();
        await page.waitForTimeout(1000);
        
        // 本文を段落ごとに分けて入力
        const paragraphs = articleData.content.split('\n\n');
        for (const paragraph of paragraphs) {
            if (paragraph.trim()) {
                await contentArea.type(paragraph, { delay: 50 });
                await contentArea.press('Enter');
                await contentArea.press('Enter');
                await page.waitForTimeout(500);
            }
        }
        log('本文入力完了');

        // 公開ボタンを探す
        log('公開ボタンを探索中...');
        const publishSelectors = [
            'button:has-text("公開する")',
            'button[data-testid*="publish"]',
            'button:contains("公開")',
            '.publish-button',
            '.btn-publish',
            'button[type="submit"]'
        ];

        let publishButton = null;
        for (const selector of publishSelectors) {
            try {
                log(`公開ボタンセレクタ試行: ${selector}`);
                
                if (selector.includes('has-text') || selector.includes('contains')) {
                    // テキストベースの検索
                    publishButton = await page.$x("//button[contains(text(), '公開')]");
                    if (publishButton.length > 0) {
                        publishButton = publishButton[0];
                        log('公開ボタン発見（XPath）');
                        break;
                    }
                } else {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    publishButton = await page.$(selector);
                    if (publishButton) {
                        log(`公開ボタン発見: ${selector}`);
                        break;
                    }
                }
            } catch (error) {
                log(`公開ボタンセレクタ失敗: ${selector} - ${error.message}`);
            }
        }

        // 全てのボタンを確認
        if (!publishButton) {
            log('全ボタンを確認中...');
            const allButtons = await page.$$('button');
            for (let i = 0; i < allButtons.length; i++) {
                const buttonText = await page.evaluate(el => el.textContent, allButtons[i]);
                log(`Button ${i}: "${buttonText}"`);
                
                if (buttonText.includes('公開') || buttonText.includes('投稿') || buttonText.includes('送信')) {
                    publishButton = allButtons[i];
                    log(`公開ボタンとして採用: Button ${i} - "${buttonText}"`);
                    break;
                }
            }
        }

        if (!publishButton) {
            throw new Error('公開ボタンが見つかりません');
        }

        // 公開ボタンをクリック
        log('公開ボタンをクリック中...');
        await publishButton.click();
        await page.waitForTimeout(3000);

        // 最終確認ダイアログがある場合の処理
        try {
            const confirmButton = await page.$x("//button[contains(text(), '公開') or contains(text(), '確認') or contains(text(), 'OK')]");
            if (confirmButton.length > 0) {
                log('最終確認ボタンをクリック');
                await confirmButton[0].click();
                await page.waitForTimeout(2000);
            }
        } catch (error) {
            log(`最終確認処理: ${error.message}`);
        }

        // 投稿完了の確認
        await page.waitForTimeout(5000);
        const finalUrl = page.url();
        log(`最終URL: ${finalUrl}`);

        if (finalUrl.includes('/n/n') || finalUrl !== 'https://note.com/n/new') {
            log('✅ 投稿が正常に完了しました！');
            return { success: true, url: finalUrl };
        } else {
            log('⚠️ 投稿の完了を確認できませんでした');
            return { success: false, message: '投稿完了の確認ができませんでした' };
        }

    } catch (error) {
        log(`❌ エラー発生: ${error.message}`);
        log(`スタックトレース: ${error.stack}`);
        throw error;
    } finally {
        if (browser) {
            log('ブラウザを終了中...');
            await browser.close();
        }
    }
}

// 実行
if (process.env.NODE_ENV !== 'test') {
    postToNote()
        .then(result => {
            log('投稿処理完了');
            log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            log(`投稿処理失敗: ${error.message}`);
            process.exit(1);
        });
}

export default postToNote;
