import { chromium } from 'playwright';
import fs from 'fs';

// 詳細なログ出力関数
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function postToNote() {
    let browser;
    let context;
    let page;
    
    try {
        log('=== note.com自動投稿開始 ===');
        log('Playwrightブラウザを起動中...');
        
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--no-first-run',
                '--disable-default-apps'
            ]
        });

        // コンテキストを作成（セッション管理用）
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 },
            locale: 'ja-JP',
            timezoneId: 'Asia/Tokyo'
        });

        page = await context.newPage();

        // 詳細なログ設定
        page.on('console', msg => log(`ブラウザ: ${msg.text()}`));
        page.on('pageerror', error => log(`ページエラー: ${error.message}`));
        page.on('requestfailed', request => log(`リクエスト失敗: ${request.url()}`));

        // セッション情報を復元
        const sessionData = process.env.NOTE_STORAGE_STATE_JSON;
        if (sessionData) {
            log('セッション情報を復元中...');
            try {
                const state = JSON.parse(sessionData);
                
                // Cookieを設定
                if (state.cookies && state.cookies.length > 0) {
                    await context.addCookies(state.cookies);
                    log(`${state.cookies.length}個のCookieを復元`);
                }

                // LocalStorageを設定するためにページを読み込み
                await page.goto('https://note.com/', { waitUntil: 'domcontentloaded' });
                
                if (state.localStorage) {
                    await page.evaluate((localStorage) => {
                        for (const [key, value] of Object.entries(localStorage)) {
                            window.localStorage.setItem(key, value);
                        }
                    }, state.localStorage);
                    log(`${Object.keys(state.localStorage).length}個のLocalStorageアイテムを復元`);
                }

                log('✅ セッション復元完了');
            } catch (error) {
                log(`⚠️ セッション復元エラー: ${error.message}`);
            }
        } else {
            // セッション情報がない場合はnote.comにアクセス
            await page.goto('https://note.com/', { waitUntil: 'domcontentloaded' });
        }

        // 記事データを読み込み
        log('生成された記事を読み込み中...');
        const articleData = JSON.parse(fs.readFileSync('article.json', 'utf8'));
        log(`記事データ読み込み完了:`);
        log(`- タイトル: "${articleData.title}"`);
        log(`- 本文文字数: ${articleData.content.length}文字`);

        // 投稿ページに移動
        log('投稿ページに移動中...');
        await page.goto('https://note.com/n/new', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });

        // ページの現在のURL確認
        const currentUrl = page.url();
        log(`現在のURL: ${currentUrl}`);

        // ログイン状態を確認
        if (currentUrl.includes('/signin') || currentUrl.includes('/login')) {
            throw new Error('❌ ログインが必要です。セッション情報を確認してください。');
        }

        // ページが完全に読み込まれるまで待機
        log('ページの完全読み込みを待機中...');
        await page.waitForTimeout(3000);

        // ページの構造を分析
        log('🔍 ページ構造を分析中...');
        const pageInfo = await page.evaluate(() => {
            const allInputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
                .map((el, index) => ({
                    index,
                    tagName: el.tagName,
                    type: el.type || 'unknown',
                    placeholder: el.placeholder || '',
                    contentEditable: el.contentEditable,
                    className: el.className,
                    id: el.id,
                    visible: el.offsetParent !== null,
                    text: el.textContent?.slice(0, 50) || ''
                }));

            const allButtons = Array.from(document.querySelectorAll('button'))
                .map((el, index) => ({
                    index,
                    text: el.textContent?.trim() || '',
                    className: el.className,
                    disabled: el.disabled,
                    visible: el.offsetParent !== null
                }));

            return { inputs: allInputs, buttons: allButtons };
        });

        log('📊 ページ構造分析結果:');
        log(`- Input要素: ${pageInfo.inputs.length}個`);
        log(`- Button要素: ${pageInfo.buttons.length}個`);

        // デバッグ用：要素の詳細を出力
        pageInfo.inputs.forEach(input => {
            if (input.visible) {
                log(`  Input[${input.index}]: ${input.tagName}, placeholder="${input.placeholder}", class="${input.className}"`);
            }
        });

        pageInfo.buttons.forEach(button => {
            if (button.visible && button.text) {
                log(`  Button[${button.index}]: "${button.text}", class="${button.className}"`);
            }
        });

        // タイトル入力欄を探索
        log('🎯 タイトル入力欄を探索中...');
        let titleElement = null;

        // Playwrightの強力なセレクタを使用
        const titleSelectors = [
            'input[placeholder*="タイトル"]',
            'input[placeholder*="title"]', 
            'textarea[placeholder*="タイトル"]',
            '[contenteditable="true"]',
            'input[type="text"]',
            '[data-testid*="title"]',
            '.editor input',
            '.title input'
        ];

        for (const selector of titleSelectors) {
            try {
                log(`🔍 セレクタ試行: ${selector}`);
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: 3000 })) {
                    titleElement = element;
                    log(`✅ タイトル入力欄発見: ${selector}`);
                    break;
                }
            } catch (error) {
                log(`❌ セレクタ失敗: ${selector}`);
            }
        }

        // セレクタで見つからない場合は、最初の表示されているテキスト入力欄を使用
        if (!titleElement) {
            log('📋 全input要素から適切な要素を探索中...');
            const visibleInputs = pageInfo.inputs.filter(inp => 
                inp.visible && 
                (inp.type === 'text' || inp.type === 'unknown' || inp.contentEditable === 'true')
            );

            if (visibleInputs.length > 0) {
                const firstInput = visibleInputs[0];
                titleElement = page.locator(`input, textarea, [contenteditable="true"]`).nth(firstInput.index);
                log(`✅ タイトル入力欄として採用: Input[${firstInput.index}]`);
            }
        }

        if (!titleElement) {
            throw new Error('❌ タイトル入力欄が見つかりません');
        }

        // タイトルを入力
        log('📝 タイトルを入力中...');
        await titleElement.click();
        await page.waitForTimeout(1000);
        await titleElement.fill(''); // 既存内容をクリア
        await titleElement.type(articleData.title, { delay: 100 });
        log('✅ タイトル入力完了');

        // 本文入力欄を探索
        log('🎯 本文入力欄を探索中...');
        let contentElement = null;

        const contentSelectors = [
            '[contenteditable="true"]:not(input)',
            '.editor [contenteditable="true"]',
            'textarea:not([placeholder*="タイトル"])',
            '.ql-editor',
            '[data-testid*="editor"]',
            '.note-editor',
            '.editor-content'
        ];

        for (const selector of contentSelectors) {
            try {
                log(`🔍 本文セレクタ試行: ${selector}`);
                const elements = page.locator(selector);
                const count = await elements.count();
                
                for (let i = 0; i < count; i++) {
                    const element = elements.nth(i);
                    if (await element.isVisible({ timeout: 2000 })) {
                        // タイトル入力欄でないことを確認
                        const isSameAsTitle = await element.evaluate((el, titleEl) => {
                            return el === titleEl;
                        }, await titleElement.elementHandle());
                        
                        if (!isSameAsTitle) {
                            contentElement = element;
                            log(`✅ 本文入力欄発見: ${selector} (${i}番目)`);
                            break;
                        }
                    }
                }
                
                if (contentElement) break;
            } catch (error) {
                log(`❌ 本文セレクタ失敗: ${selector}`);
            }
        }

        if (!contentElement) {
            // 最後の手段：タイトル以外のcontenteditable要素を探す
            log('📋 全contenteditable要素から本文欄を探索中...');
            const allEditables = page.locator('[contenteditable="true"]');
            const count = await allEditables.count();
            
            for (let i = 0; i < count; i++) {
                const element = allEditables.nth(i);
                if (await element.isVisible()) {
                    const isSameAsTitle = await element.evaluate((el, titleEl) => {
                        return el === titleEl;
                    }, await titleElement.elementHandle());
                    
                    if (!isSameAsTitle) {
                        contentElement = element;
                        log(`✅ 本文入力欄として採用: contenteditable[${i}]`);
                        break;
                    }
                }
            }
        }

        if (!contentElement) {
            throw new Error('❌ 本文入力欄が見つかりません');
        }

        // 本文を入力
        log('📝 本文を入力中...');
        await contentElement.click();
        await page.waitForTimeout(1000);
        
        // 既存内容をクリア
        await contentElement.fill('');
        await page.waitForTimeout(500);

        // 本文を段落ごとに入力
        const paragraphs = articleData.content.split('\n\n').filter(p => p.trim());
        log(`📄 ${paragraphs.length}個の段落を入力予定`);

        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i].trim();
            if (paragraph) {
                log(`📝 段落${i+1}/${paragraphs.length}を入力中... (${paragraph.length}文字)`);
                await contentElement.type(paragraph, { delay: 30 });
                
                // 最後の段落でなければ改行を追加
                if (i < paragraphs.length - 1) {
                    await contentElement.press('Enter');
                    await contentElement.press('Enter');
                }
                
                await page.waitForTimeout(300);
            }
        }
        
        log('✅ 本文入力完了');

        // 少し待機してから公開処理へ
        await page.waitForTimeout(2000);

        // 公開ボタンを探索（下書き投稿を優先）
        log('🎯 投稿ボタンを探索中...');
        let publishButton = null;

        // 下書き保存を優先的に探す
        const publishSelectors = [
            'button:has-text("下書き")',
            'button:has-text("下書きとして保存")',
            'button:has-text("保存")',
            'button:has-text("公開する")',
            'button:has-text("投稿")',
            'button[data-testid*="publish"]',
            'button[data-testid*="save"]',
            '.publish-button',
            '.save-button'
        ];

        for (const selector of publishSelectors) {
            try {
                log(`🔍 投稿ボタンセレクタ試行: ${selector}`);
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: 3000 })) {
                    publishButton = element;
                    log(`✅ 投稿ボタン発見: ${selector}`);
                    break;
                }
            } catch (error) {
                log(`❌ 投稿ボタンセレクタ失敗: ${selector}`);
            }
        }

        // セレクタで見つからない場合、全ボタンから適切なものを探す
        if (!publishButton) {
            log('📋 全ボタンから投稿ボタンを探索中...');
            const publishButtons = pageInfo.buttons.filter(btn => 
                btn.visible && 
                (btn.text.includes('下書き') || 
                 btn.text.includes('保存') || 
                 btn.text.includes('公開') || 
                 btn.text.includes('投稿'))
            );

            if (publishButtons.length > 0) {
                // 下書き関連を優先
                const draftButton = publishButtons.find(btn => 
                    btn.text.includes('下書き') || btn.text.includes('保存')
                );
                
                const targetButton = draftButton || publishButtons[0];
                publishButton = page.locator('button').nth(targetButton.index);
                log(`✅ 投稿ボタンとして採用: "${targetButton.text}"`);
            }
        }

        if (!publishButton) {
            throw new Error('❌ 投稿/保存ボタンが見つかりません');
        }

        // 投稿ボタンをクリック
        const buttonText = await publishButton.textContent();
        log(`🚀 投稿ボタンをクリック: "${buttonText}"`);
        await publishButton.click();

        // 処理完了を待機
        await page.waitForTimeout(3000);

        // 確認ダイアログがある場合の処理
        try {
            log('🔍 確認ダイアログをチェック中...');
            const confirmButtons = [
                'button:has-text("確認")',
                'button:has-text("OK")',
                'button:has-text("公開")',
                'button:has-text("保存")'
            ];

            for (const selector of confirmButtons) {
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: 2000 })) {
                    log(`✅ 確認ボタン発見: ${selector}`);
                    await element.click();
                    await page.waitForTimeout(2000);
                    break;
                }
            }
        } catch (error) {
            log(`⚠️ 確認ダイアログ処理: ${error.message}`);
        }

        // 投稿完了の確認
        await page.waitForTimeout(5000);
        const finalUrl = page.url();
        log(`📍 最終URL: ${finalUrl}`);

        // 成功判定
        const success = finalUrl.includes('/n/n') || finalUrl !== 'https://note.com/n/new';
        
        if (success) {
            log('🎉 投稿が正常に完了しました！');
            log(`📰 記事URL: ${finalUrl}`);
            return { 
                success: true, 
                url: finalUrl,
                title: articleData.title,
                contentLength: articleData.content.length
            };
        } else {
            log('⚠️ 投稿の完了を確認できませんでした');
            return { 
                success: false, 
                message: '投稿完了の確認ができませんでした',
                finalUrl: finalUrl
            };
        }

    } catch (error) {
        log(`❌ エラー発生: ${error.message}`);
        log(`📍 エラー発生時URL: ${page ? page.url() : 'N/A'}`);
        
        // エラー時のスクリーンショット撮影
        if (page) {
            try {
                await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
                log('📸 エラー時のスクリーンショットを保存しました');
            } catch (screenshotError) {
                log(`📸 スクリーンショット保存失敗: ${screenshotError.message}`);
            }
        }
        
        throw error;
    } finally {
        if (context) {
            log('🔄 ブラウザコンテキストを終了中...');
            await context.close();
        }
        if (browser) {
            log('🔄 ブラウザを終了中...');
            await browser.close();
        }
        log('=== note.com自動投稿終了 ===');
    }
}

// 実行
if (process.env.NODE_ENV !== 'test') {
    postToNote()
        .then(result => {
            log('✅ 投稿処理完了');
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            log(`❌ 投稿処理失敗: ${error.message}`);
            process.exit(1);
        });
}

export default postToNote;
