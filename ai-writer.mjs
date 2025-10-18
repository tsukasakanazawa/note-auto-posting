import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function generateArticle() {
  try {
    // 環境変数から取得
    const topic = process.env.TOPIC || '';
    const targetAudience = process.env.TARGET_AUDIENCE || 'ラグジュアリーブランドやMBB、コンサル業界のプロフェッショナル';
    const thinkingMemo = process.env.THINKING_MEMO || '';
    const direction = process.env.DIRECTION || '';
    const focusArea = process.env.FOCUS_AREA || '';

    console.log('=== 環境変数チェック ===');
    console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '設定済み' : '未設定');
    console.log('TOPIC:', topic || '（空）');
    console.log('TARGET_AUDIENCE:', targetAudience);
    console.log('THINKING_MEMO:', thinkingMemo ? `${thinkingMemo.substring(0, 50)}...` : '（空）');
    console.log('DIRECTION:', direction || '（空）');
    console.log('FOCUS_AREA:', focusArea || '（空）');

    // リサーチ結果を読み込み
    let researchContent = '';
    try {
      researchContent = await fs.readFile('research.md', 'utf-8');
      console.log('✅ リサーチ結果を読み込みました（', researchContent.length, '文字）');
    } catch (error) {
      console.warn('⚠️ research.mdが見つかりません。リサーチなしで記事を生成します。');
      researchContent = '（リサーチデータなし。一般的な知識に基づいて記事を生成してください。）';
    }

    console.log('記事生成を開始します...');

    // 記事生成プロンプト（簡潔版）
    const articlePrompt = `
あなたは、MBB上位パートナー、電通、P&G、BOFで経営幹部を歴任し、現在は日本のラグジュアリーブランド日本法人トップを務めるプロフェッショナルです。戦略コンサルの定量分析力とクリエイティブエージェンシーの定性洞察力を兼ね備え、ファッション史、現代アート、建築理論、音楽に精通しています。

## 執筆の起点：思考メモ

${thinkingMemo || '（特になし。業界で今最もホットな話題を選んでください）'}

## 執筆条件

- **トピック**: ${topic || '（上記の思考メモとリサーチ結果から最適なトピックを決定）'}
- **ターゲット読者**: ${targetAudience}
- **記事の方向性**: ${direction || '（思考メモから判断）'}
- **深掘り領域**: ${focusArea || '（思考メモから判断）'}

## リサーチ結果

${researchContent}

## 記事の目的

ビザスクレベルの、クローズドなラグジュアリーブランド業界情報をNOTE読者に提供。

**必須要件**:
- ✅ 具体的な数値・企業名・事例（ファクトチェック必須）
- ✅ 業界インサイダー視点
- ✅ 実務的価値

## 基本構成（2,500-3,000文字）

1. **タイトル**: 具体的・検索されやすい・プロフェッショナル向け・クリエイティブ
2. **導入**: 200-300文字
3. **目次**: 4-6セクション
4. **本文**: 各セクション400-600文字、データ・事例・分析・定性視点を含む
5. **参考**: 最低5つの信頼できる情報源（URL）

## 執筆スタイル

- プロフェッショナルかつ読みやすい（敬体）
- データと物語性の融合、定量と定性のバランス
- 具体的な企業名・ブランド名を積極使用
- インサイダー視点（「業界内では〇〇が共通認識」「実際の現場では△△」）

## 注意事項

- ❌ コンサルティングファーム出身の表現は使わない
- ✅ 業界従事者として・現場での経験から

## 出力形式

以下のJSON形式のみを出力してください（JSON以外のテキストは不要）:

\`\`\`json
{
  "title": "記事タイトル",
  "introduction": "導入文（200-300文字）",
  "tableOfContents": ["セクション1", "セクション2", "セクション3", "セクション4", "まとめと今後の展望"],
  "content": "# セクション1\\n\\n本文...\\n\\n# セクション2\\n\\n本文...（Markdown形式、2,500-3,000文字）",
  "summary": "記事全体の要約（100-150文字）",
  "references": [
    "[参考文献1](URL1)",
    "[参考文献2](URL2)",
    "[参考文献3](URL3)",
    "[参考文献4](URL4)",
    "[参考文献5](URL5)"
  ],
  "tags": ["#ラグジュアリーブランド", "#ブランド戦略", "#タグ3", "#タグ4", "#タグ5", "#タグ6", "#タグ7", "#タグ8"]
}
\`\`\`
`;

    console.log('プロンプト長:', articlePrompt.length, '文字');

    // Claude APIで記事生成
    console.log('Claude APIにリクエスト送信中...');
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
    console.log('✅ Claude APIからの応答を受信しました（', responseText.length, '文字）');

    // デバッグ: 応答の最初の500文字を表示
    console.log('=== 応答プレビュー ===');
    console.log(responseText.substring(0, 500));
    console.log('...\n');

    // JSONの抽出（```json と ``` の間、または {} のみ）
    let articleData;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                     responseText.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch) {
      console.log('JSON抽出成功');
      try {
        articleData = JSON.parse(jsonMatch[1]);
        console.log('✅ JSONパース成功');
      } catch (parseError) {
        console.error('❌ JSONパースエラー:', parseError.message);
        console.error('抽出されたJSON:', jsonMatch[1].substring(0, 500));
        throw parseError;
      }
    } else {
      console.error('❌ JSONが見つかりませんでした');
      console.error('応答全体:', responseText);
      throw new Error('JSONが見つかりませんでした');
    }

    // 必須フィールドの検証
    const requiredFields = ['title', 'content', 'summary', 'tags', 'references'];
    for (const field of requiredFields) {
      if (!articleData[field]) {
        throw new Error(`必須フィールド ${field} が見つかりません`);
      }
    }
    console.log('✅ 必須フィールド検証完了');

    // draft.jsonに保存
    await fs.writeFile('draft.json', JSON.stringify(articleData, null, 2));
    console.log('✅ draft.jsonを生成しました');

    // generated_article.mdにも保存（デバッグ用）
    const markdownContent = `# ${articleData.title}\n\n${articleData.introduction || ''}\n\n${articleData.content}\n\n## 参考\n${articleData.references.join('\n')}\n\n${articleData.tags.join(' ')}`;
    await fs.writeFile('generated_article.md', markdownContent);
    console.log('✅ generated_article.mdを生成しました');

    console.log('\n=== 生成された記事 ===');
    console.log('タイトル:', articleData.title);
    console.log('文字数:', articleData.content.length);
    console.log('タグ数:', articleData.tags.length);
    console.log('参考文献数:', articleData.references.length);

    process.exit(0);

  } catch (error) {
    console.error('\n❌❌❌ エラーが発生しました ❌❌❌');
    console.error('エラーメッセージ:', error.message);
    console.error('エラースタック:');
    console.error(error.stack);
    
    // エラー詳細をファイルに保存
    try {
      await fs.writeFile('error_log.txt', `
エラー発生時刻: ${new Date().toISOString()}
エラーメッセージ: ${error.message}
スタックトレース:
${error.stack}

環境変数:
- TOPIC: ${process.env.TOPIC || '（空）'}
- TARGET_AUDIENCE: ${process.env.TARGET_AUDIENCE || '（空）'}
- THINKING_MEMO: ${process.env.THINKING_MEMO || '（空）'}
- DIRECTION: ${process.env.DIRECTION || '（空）'}
- FOCUS_AREA: ${process.env.FOCUS_AREA || '（空）'}
`);
      console.log('エラーログをerror_log.txtに保存しました');
    } catch (writeError) {
      console.error('エラーログの保存に失敗:', writeError.message);
    }
    
    process.exit(1);
  }
}

generateArticle();

