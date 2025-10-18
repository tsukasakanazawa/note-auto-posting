import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function conductResearch() {
  try {
    const topic = process.env.TOPIC || 'ラグジュアリーブランドの最新トレンド';
    const targetAudience = process.env.TARGET_AUDIENCE || 'ラグジュアリーブランドやMBB、コンサル業界のプロフェッショナル';
    const thinkingMemo = process.env.THINKING_MEMO || '';
    const direction = process.env.DIRECTION || '';
    const focusArea = process.env.FOCUS_AREA || '';

    console.log('リサーチを開始します...');
    console.log('トピック:', topic);

    const researchPrompt = `
あなたはラグジュアリーブランド業界の専門家です。以下の条件でリサーチを行ってください。

${thinkingMemo ? `## 執筆者の思考メモ\n${thinkingMemo}\n\n` : ''}

## リサーチ条件
- トピック: ${topic}
- ターゲット読者: ${targetAudience}
${direction ? `- 方向性: ${direction}` : ''}
${focusArea ? `- 深掘り領域: ${focusArea}` : ''}

## リサーチすべき内容
1. 業界の最新動向（過去6ヶ月）
2. 具体的な事例（企業名・ブランド名明記）
3. 重要なデータ・統計（出典付き）
4. 今後の展望
5. 参考情報源（URL、最低5つ）

${thinkingMemo ? '思考メモから執筆者の意図を読み取り、最適なトピックとアプローチを提案してください。' : ''}

以下のMarkdown形式で出力してください:

# リサーチ結果

${thinkingMemo ? '## 【思考メモの解釈】\n（思考メモから読み取った執筆者の意図）\n\n' : ''}

## 【推奨トピック】
（最終的に記事化すべきトピック）

## 【業界動向】
（最新のトレンド、データ、ニュース）

## 【具体的事例】
（企業名・ブランド名を明記、3-5個）

## 【重要なデータ・統計】
（数字で語れる事実、出典付き）

## 【今後の展望】
（向こう6-12ヶ月の予測）

## 【参考情報源】
（信頼できる情報源のURL、最低5つ）
`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: researchPrompt
        }
      ]
    });

    const researchResult = message.content[0].text;
    
    await fs.writeFile('research.md', researchResult);
    console.log('✅ リサーチ完了: research.md を生成しました');

  } catch (error) {
    console.error('❌ リサーチエラー:', error.message);
    
    // フォールバック
    const fallbackContent = `# リサーチ結果

## トピック
${process.env.TOPIC || 'ラグジュアリーブランドの最新動向'}

${process.env.THINKING_MEMO ? `## 思考メモ\n${process.env.THINKING_MEMO}\n\n` : ''}

リサーチAPIでエラーが発生したため、上記の情報のみで記事を生成します。
`;
    
    await fs.writeFile('research.md', fallbackContent);
    console.log('⚠️ フォールバックモードでresearch.mdを生成しました');
  }
}

conductResearch();
