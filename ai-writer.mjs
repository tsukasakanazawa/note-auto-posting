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
      const fullResearch = await fs.readFile('research.md', 'utf-8');
      researchContent = fullResearch.substring(0, 2000);
      console.log('リサーチ結果読み込み:', researchContent.length, '文字');
    } catch (error) {
      researchContent = 'リサーチデータなし';
    }

    const today = new Date().toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });

    const articlePrompt = `ラグジュアリーブランド業界の日本法人トップとして、Bloomberg風の朝刊を作成。

リサーチ:
${researchContent}

以下のJSON形式で出力:

\`\`\`json
{
  "title": "一日を始める前に読んでおきたいラグジュアリーブランド業界のニュース5本 - ${today}",
  "introduction": "一日を始める前に読んでおきたいラグジュアリーブランド業界のニュース5本",
  "tableOfContents": ["1. ニュース1", "2. ニュース2", "3. ニュース3", "4. ニュース4", "5. ニュース5"],
  "content": "# 1. [見出し]\\n\\n本文200-300文字\\n\\n# 2. [見出し]\\n\\n本文200-300文字\\n\\n# 3. [見出し]\\n\\n本文200-300文字\\n\\n# 4. [見出し]\\n\\n本文200-300文字\\n\\n# 5. [見出し]\\n\\n本文250-300文字",
  "summary": "マーケットで話題になったニュースをお届けします。一日を始めるにあたって押さえておきたいニュースはこちら。",
  "references": ["[参考1](URL1)", "[参考2](URL2)", "[参考3](URL3)", "[参考4](URL4)", "[参考5](URL5)"],
  "tags": ["#ラグジュアリーブランド", "#業界ニュース", "#朝刊", "#ファッションビジネス", "#LVMH", "#Kering", "#市場動向", "#最新トレンド"]
}
\`\`\`

JSON以外出力禁止。各ニュース250-300文字、具体的な企業名・数字必須。`;

    console.log('Claude APIリクエスト中...');

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',  // ✅ Haikuに変更
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

    console.log('\n=== 完了 ===');
    console.log('タイトル:', articleData.title);
    console.log('文字数:', articleData.content.length);

  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateMorningBrief();
