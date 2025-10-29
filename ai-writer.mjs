import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function generateMorningBrief() {
  try {
    console.log('=== 朝刊記事生成開始 ===');

    // リサーチ結果を読み込み
    let researchContent = '';
    try {
      researchContent = await fs.readFile('research.md', 'utf-8');
      console.log('✅ リサーチ結果を読み込みました（', researchContent.length, '文字）');
    } catch (error) {
      console.warn('⚠️ research.mdが見つかりません');
      researchContent = 'リサーチデータなし';
    }

    const today = new Date().toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });

    const articlePrompt = `
あなたはラグジュアリーブランド業界の日本法人トップです。MBB、電通、P&G、BOFで経営幹部を歴任し、業界の最前線で活躍しています。

## ミッション
Bloombergの「Five Things to Start Your Day」のラグジュアリーブランド版を作成してください。

## スタイル参考
- 簡潔で要点を押さえた文章（1ニュースあたり200-300文字）
- 具体的な数字・企業名を明記
- 「なぜ重要か」を簡潔に説明
- プロフェッショナル向けの文体

## リサーチ結果
${researchContent}

## 記事フォーマット

以下のJSON形式で出力してください:

\`\`\`json
{
  "title": "一日を始める前に読んでおきたいラグジュアリーブランド業界のニュース5本 - ${today}",
  "introduction": "一日を始める前に読んでおきたいラグジュアリーブランド業界のニュース5本",
  "tableOfContents": [
    "1. [ニュース1の見出し]",
    "2. [ニュース2の見出し]",
    "3. [ニュース3の見出し]",
    "4. [ニュース4の見出し]",
    "5. [ニュース5の見出し]"
  ],
  "content": "# 1. [ニュース1の見出し]\\n\\n[本文200-300文字]\\n\\n# 2. [ニュース2の見出し]\\n\\n[本文200-300文字]\\n\\n# 3. [ニュース3の見出し]\\n\\n[本文200-300文字]\\n\\n# 4. [ニュース4の見出し]\\n\\n[本文200-300文字]\\n\\n# 5. [ニュース5の見出し]\\n\\n[本文200-300文字]\\n\\n---\\n\\n## その他の注目ニュース\\n\\n- [ニュース6の1行要約]\\n- [ニュース7の1行要約]\\n- [ニュース8の1行要約]",
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

**重要な執筆ルール**:
- 各ニュースは250-300文字に収める（簡潔に）
- 「〜と報じられた」「〜を発表した」など、事実ベースで
- 具体的な数字・企業名・日付を必ず含める
- 業界への影響を1-2行で簡潔に説明
- 全体で1,500-2,000文字（読了時間3-5分）

JSON以外は出力しないでください。
`;

    console.log('Claude APIにリクエスト送信...');

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 6000,
      temperature: 0.7,
      messages: [{ role: 'user', content: articlePrompt }]
    });

    const responseText = message.content[0].text;
    console.log('✅ Claude APIからの応答を受信');

    // JSONの抽出
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                     responseText.match(/(\{[\s\S]*\})/);
    
    if (!jsonMatch) {
      throw new Error('JSONが見つかりませんでした');
    }

    const articleData = JSON.parse(jsonMatch[1]);

    // 必須フィールドの検証
    const requiredFields = ['title', 'content', 'summary', 'tags', 'references'];
    for (const field of requiredFields) {
      if (!articleData[field]) {
        throw new Error(`必須フィールド ${field} が見つかりません`);
      }
    }

    // draft.jsonに保存
    await fs.writeFile('draft.json', JSON.stringify(articleData, null, 2));
    console.log('✅ draft.jsonを生成しました');

    // generated_article.mdにも保存
    const markdownContent = `# ${articleData.title}\n\n${articleData.introduction}\n\n${articleData.content}\n\n## 参考\n${articleData.references.join('\n')}\n\n${articleData.tags.join(' ')}`;
    await fs.writeFile('generated_article.md', markdownContent);
    console.log('✅ generated_article.mdを生成しました');

    console.log('\n=== 生成された朝刊 ===');
    console.log('タイトル:', articleData.title);
    console.log('文字数:', articleData.content.length);

  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateMorningBrief();

