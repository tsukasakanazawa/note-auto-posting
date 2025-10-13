import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function generateArticle(theme, target, message, cta) {
  console.log('🧠 AI記事生成を開始...');
  
  const prompt = `
あなたは優秀なライターです。以下の条件で魅力的なnote記事を作成してください。

【条件】
- テーマ: ${theme}
- 想定読者: ${target}
- 核となるメッセージ: ${message}
- 読後のアクション: ${cta}

【記事の構成】
1. 導入：読者の関心を引く
2. 本文：具体例や体験談を含む
3. まとめ：行動を促す結論

【出力形式】
以下のJSON形式で出力してください：
{
  "title": "記事タイトル",
  "content": "記事本文（改行は\\nで表現）",
  "tags": ["タグ1", "タグ2", "タグ3"]
}

文字数：1500-2000文字程度
トーン：親しみやすく、実用的
`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0].text;
    console.log('✅ AI記事生成完了');
    
    // JSONを抽出
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('AI応答からJSONを抽出できませんでした');
    }
    
  } catch (error) {
    console.error('❌ AI記事生成エラー:', error.message);
    throw error;
  }
}

// コマンドライン引数から実行
const [,, theme, target, message, cta] = process.argv;
const article = await generateArticle(theme, target, message, cta);
console.log(JSON.stringify(article, null, 2));
