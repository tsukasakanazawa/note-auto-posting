import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function generateMorningBrief() {
  try {
    console.log('=== 朝刊記事生成開始 ===');

    let researchContent = '';
    try {
      researchContent = await fs.readFile('research.md', 'utf-8');
      console.log('リサーチ結果読み込み完了');
    } catch (error) {
      researchContent = 'リサーチデータなし';
    }

    const today = new Date().toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });

    const articlePrompt = `
あなたはラグジュアリーブランド業界の日本法人トップです。

Bloomberg「Five Things to Start Your Day」風の朝刊を作成してください。

## リサーチ結果
${researchContent}

## フォーマット

\`\`\`json
{
  "title": "一日を始める前に読んでおきたいラグジュアリーブランド業界のニュース5本- ${today}",
  "introduction": "一日を始める前に読んでおきたいラグジュアリーブランド業界のニュース5本",
  "tableOfContents": [
    "1. [ニュース1見出し]",
    "2. [ニュース2見出し]",
    "3. [ニュース3見出し]",
    "4. [ニュース4見出し]",
    "5. [ニュース5見出し]"
  ],
  "content": "# 1. [見出し]\\n\\n[本文200-300文字]\\n\\n# 2. [見出し]\\n\\n[本文200-300文字]\\n\\n# 3. [見出し]\\n\\n[本文200-300文字]\\n\\n# 4. [見出し]\\n\\n[本文200-300文字]\\n\\n# 5. [見出し]\\n\\n[本文200-300文字]\\n\\n---\\n\\n## その他の注目ニュース\\n\\n- [ニュース6]\\n- [ニュース7]\\n- [ニュース8]",
  "summary": "マーケットで話題になったニュースをお届けします。一日を始めるにあたって押さえておきたいニュースはこちら。",
  "references": [
    "[参考1](URL1)",
    "[参考2](URL2)",
    "[参考3](URL3)",
    "[参考4](URL4)",
    "[参考5](URL5)"
  ],
  "tags": [
    "#ラグジュアリーブランド",
    "#業界ニュース",
    "#朝刊",
    "#ファッションビジネス",
    "#LVMH",
    "#Kering",
    "#市場動向",
    "#最新トレンド"
  ]
}
\`\`\`

ルール:
- 各ニュース200-300文字
- 具体的な数字・企業名必須
- 全体1,500-2,000文字
- JSON以外出力禁止
`;

    console.log('Claude APIリクエスト中...');

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 6000,
      temperature: 0.7,
      messages: [{ role: 'user', content: articlePrompt }]
    });

    const responseText = message.content[0].text;
    console.log('✅ 応答受信');

    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                     responseText.match(/(\{[\s\S]*\})/);
    
    if (!jsonMatch) throw new Error('JSON未発見');

    const articleData = JSON.parse(jsonMatch[1]);

    const requiredFields = ['title', 'content', 'summary', 'tags', 'references'];
    for (const field of requiredFields) {
      if (!articleData[field]) throw new Error(`${field}未定義`);
    }

    await fs.writeFile('draft.json', JSON.stringify(articleData, null, 2));
    console.log('✅ draft.json生成');

    const markdown = `# ${articleData.title}\n\n${articleData.introduction}\n\n${articleData.content}\n\n## 参考\n${articleData.references.join('\n')}\n\n${articleData.tags.join(' ')}`;
    await fs.writeFile('generated_article.md', markdown);
    console.log('✅ generated_article.md生成');

  } catch (error) {
    console.error('❌ エラー:', error.message);
    process.exit(1);
  }
}

generateMorningBrief();
