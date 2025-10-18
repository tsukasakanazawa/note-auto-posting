import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function generateArticle() {
  try {
    const topic = process.env.TOPIC || 'ラグジュアリーブランドの最新トレンド';
    const targetAudience = process.env.TARGET_AUDIENCE || 'ラグジュアリーブランドやMBB、コンサル業界のプロフェッショナル';
    const thinkingMemo = process.env.THINKING_MEMO || '';
    const direction = process.env.DIRECTION || '';
    const focusArea = process.env.FOCUS_AREA || '';

    // リサーチ結果を読み込み
    let researchContent = '';
    try {
      researchContent = await fs.readFile('research.md', 'utf-8');
      console.log('リサーチ結果を読み込みました');
    } catch (error) {
      console.warn('research.mdが見つかりません。リサーチなしで記事を生成します。');
      researchContent = 'リサーチデータなし。一般的な知識に基づいて記事を作成してください。';
    }

    console.log('記事生成を開始します...');

    const articlePrompt = `
あなたはラグジュアリーブランド業界の日本法人トップです。MBB、電通、P&G、BOFで経営幹部を歴任した経験を持ち、業界の最前線で活躍するプロフェッショナルです。

${thinkingMemo ? `## あなたの思考メモ\n${thinkingMemo}\n\n` : ''}

## 執筆条件
- トピック: ${topic}
- ターゲット読者: ${targetAudience}
${direction ? `- 記事の方向性: ${direction}` : ''}
${focusArea ? `- 深掘り領域: ${focusArea}` : ''}

## リサーチ結果
${researchContent}

## 記事の目的
ビザスクレベルの、クローズドなラグジュアリーブランド業界情報をNOTE読者に提供する。
具体的なデータや事例は必ずファクトチェックしてください。

## 基本構成
1. タイトル: 具体的で検索されやすい、プロフェッショナル向けでクリエイティブな表現
2. 導入: 200-300文字
3. 目次: 4-6セクション
4. 本文: 2,500-3,000文字（各セクションでデータ・事例・分析を提供）
5. 参考: 最低5つの信頼できる情報源（URL形式）
6. ハッシュタグ: 8-10個

## 執筆スタイル
- プロフェッショナルかつ読みやすい
- データと定性視点のバランス
- 具体的な企業名・ブランド名を積極的に使用
- 業界インサイダーの視点

## 注意事項
- コンサルティングファーム出身であることは記載しない
- 業界従事者としての実務的な視点を重視

## 出力形式

以下のJSON形式で出力してください:

\`\`\`json
{
  "title": "記事タイトル",
  "introduction": "導入文（200-300文字）",
  "tableOfContents": [
    "セクション1のタイトル",
    "セクション2のタイトル",
    "セクション3のタイトル",
    "セクション4のタイトル",
    "まとめと今後の展望"
  ],
  "content": "# セクション1のタイトル\\n\\n本文...\\n\\n# セクション2のタイトル\\n\\n本文...（Markdown形式、2,500-3,000文字）",
  "summary": "記事全体の要約（100-150文字）",
  "references": [
    "[参考文献1のタイトル](URL1)",
    "[参考文献2のタイトル](URL2)",
    "[参考文献3のタイトル](URL3)",
    "[参考文献4のタイトル](URL4)",
    "[参考文献5のタイトル](URL5)"
  ],
  "tags": [
    "#ラグジュアリーブランド",
    "#ブランド戦略",
    "#タグ3",
    "#タグ4",
    "#タグ5",
    "#タグ6",
    "#タグ7",
    "#タグ8"
  ]
}
\`\`\`

JSON以外のテキストは出力しないでください。
`;

    console.log('Claude APIにリクエスト中...');

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: articlePrompt
        }
      ]
    });

    const responseText = message.content[0].text;
    console.log('Claude APIからの応答を受信しました');

    // JSONの抽出
    let articleData;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                     responseText.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch) {
      articleData = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('JSONが見つかりませんでした');
    }

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
    const markdownContent = `# ${articleData.title}\n\n${articleData.introduction || ''}\n\n${articleData.content}\n\n## 参考\n${articleData.references.join('\n')}\n\n${articleData.tags.join(' ')}`;
    await fs.writeFile('generated_article.md', markdownContent);
    console.log('✅ generated_article.mdを生成しました');

    console.log('\n=== 生成された記事 ===');
    console.log('タイトル:', articleData.title);
    console.log('文字数:', articleData.content.length);
    console.log('タグ数:', articleData.tags.length);
    console.log('参考文献数:', articleData.references.length);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateArticle();

