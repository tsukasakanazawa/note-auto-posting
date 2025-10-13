import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// リトライ機能付きのAPI呼び出し
async function callAnthropicWithRetry(messages, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Claude API呼び出し試行 ${attempt}/${maxRetries}`);
      
      const response = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2000,
        temperature: 0.7,
        messages: messages
      });
      
      console.log('API呼び出し成功');
      return response.content[0].text;
      
    } catch (error) {
      console.error(`試行 ${attempt} 失敗:`, error.message);
      
      if (error.status === 502 || error.status === 503 || error.status === 504) {
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 指数バックオフ
          console.log(`${waitTime}ms待機後に再試行...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      
      if (attempt === maxRetries) {
        throw new Error(`Claude API呼び出しが${maxRetries}回失敗しました: ${error.message}`);
      }
    }
  }
}

async function generateArticle(theme, target, message, cta) {
  try {
    console.log('記事生成開始...');
    console.log(`テーマ: ${theme}`);
    console.log(`想定読者: ${target}`);
    
    const prompt = `以下の条件で日本語のブログ記事を生成してください：

【条件】
- テーマ: ${theme}
- 想定読者: ${target}
- 伝えたいメッセージ: ${message}
- CTA: ${cta}

【要求事項】
- 文字数: 1500-2000文字
- 構成: タイトル、導入、本文（3-4つのセクション）、まとめ
- 読みやすい文体で実用的な内容
- SEOを意識したタイトル

記事のみを出力し、余計な説明は不要です。`;

    const messages = [
      {
        role: 'user',
        content: prompt
      }
    ];
    
    const article = await callAnthropicWithRetry(messages);
    
    console.log('記事生成完了');
    console.log(`生成された記事の長さ: ${article.length}文字`);
    
    return article;
    
  } catch (error) {
    console.error('記事生成エラー:', error);
    throw error;
  }
}

// コマンドライン引数から実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const theme = process.argv[2] || 'プログラミング学習のコツ';
  const target = process.argv[3] || 'プログラミング初心者';
  const message = process.argv[4] || '継続的な学習の重要性';
  const cta = process.argv[5] || 'ぜひ実践してみてください！';
  
  generateArticle(theme, target, message, cta)
    .then(article => {
      console.log('--- 生成された記事 ---');
      console.log(article);
    })
    .catch(error => {
      console.error('記事生成失敗:', error.message);
      process.exit(1);
    });
}

export { generateArticle };
