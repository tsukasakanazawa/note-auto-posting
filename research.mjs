import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function conductResearch() {
  try {
    const topic = process.env.TOPIC || '';
    const targetAudience = process.env.TARGET_AUDIENCE || 'ラグジュアリーブランドやMBB、コンサル業界のプロフェッショナル';
    const thinkingMemo = process.env.THINKING_MEMO || '';
    const direction = process.env.DIRECTION || '';
    const focusArea = process.env.FOCUS_AREA || '';

    console.log('=== リサーチ開始 ===');
    console.log('トピック:', topic || '（AIが自動決定）');
    console.log('ターゲット読者:', targetAudience);
    console.log('思考メモ:', thinkingMemo ? 'あり' : 'なし');
    console.log('記事の方向性:', direction || '（AIが自動決定）');
    console.log('深掘り領域:', focusArea || '（AIが自動決定）');

    const researchPrompt = `
あなたは、ラグジュアリーブランド業界の最前線で活躍するプロフェッショナルです。NOTE記事を執筆するための徹底的なリサーチを行ってください。

## 執筆者の思考メモ
${thinkingMemo || '特になし。自由にトピックを選定してください。'}

## 執筆条件
- **トピック**: ${topic || '上記の思考メモから最適なトピックを抽出、または業界で今ホットな話題を選定'}
- **ターゲット読者**: ${targetAudience}
- **記事の方向性**: ${direction || '思考メモの文脈から最適な方向性を判断'}
- **深掘りすべき領域**: ${focusArea || '思考メモから重要な要素を抽出'}

## リサーチの目的
上記の思考メモから、**執筆者が本当に書きたいこと・伝えたいこと**のエッセンスを読み取り、それを軸に記事の骨子を構築するためのリサーチを行ってください。

### 思考メモの解釈ガイドライン
- **断片的なキーワード** → 関連する業界動向・トレンドを調査
- **疑問形の文章** → その問いに答えるための事例・データを収集
- **企業名・ブランド名** → その企業の最新動向・戦略を深掘り
- **感情的な表現**（「面白い」「気になる」など） → その関心の背景にある構造的要因を分析
- **抽象的な概念** → 具体的な事例や数字で裏付け

## リサーチすべき内容

### 1. トピックの明確化（思考メモが曖昧な場合）
- 思考メモから読み取れる**中心的な関心事**は何か？
- それを記事化する際の**最適な切り口**は何か？
- ターゲット読者にとっての**価値・関心度**はどの程度か？

### 2. 業界の最新動向
- 過去6ヶ月の重要なニュース・発表
- 市場データ（成長率、市場規模、トレンドなど）
- 主要プレイヤーの動き（新規出店、M&A、戦略転換など）

### 3. 具体的な事例
- 成功事例・失敗事例（実名ベース）
- 革新的な取り組み・施策
- 業界のベストプラクティス

### 4. データ・統計
- 売上高、成長率、市場シェア
- 消費者動向データ
- 地域別・カテゴリ別の詳細データ

### 5. 専門家の見解・分析
- 業界レポートからの引用
- アナリストの見解
- 経営者の発言

### 6. 文化的・社会的文脈
- なぜ今このトピックが重要なのか？
- 歴史的背景・トレンドの変遷
- ファッション、アート、建築、音楽との接点

### 7. 今後の展望
- 注目すべきポイント
- 業界内での議論のポイント

## 出力形式

以下のMarkdown形式でリサーチ結果を出力してください：

# リサーチ結果

## 【思考メモの解釈】
（思考メモから読み取った執筆者の意図、記事化する際の最適なアプローチ）

## 【推奨トピック】
（最終的に記事化すべきトピックの提案）

## 【記事の核となる問い】
（この記事で答えるべき中心的な問い、2-3個）

## 【業界動向】
（最新のトレンド、データ、ニュース）

## 【具体的事例】
（企業名・ブランド名を明記した事例、3-5個）

## 【重要なデータ・統計】
（数字で語れる事実、出典付き）

## 【文化的文脈】
（ファッション・アート・建築・音楽などとの接点）

## 【今後の展望】
（向こう6-12ヶ月の予測、注目ポイント）

## 【参考情報源】
（信頼できる情報源のURL、最低5つ）

---

**重要**: 思考メモが空欄または曖昧な場合は、現在の業界で最もホットで、かつターゲット読者にとって価値の高いトピックを**あなたが主体的に選定**してください。
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
    
    // リサーチ結果のプレビュー
    const preview = researchResult.substring(0, 500);
    console.log('\n=== リサーチ結果プレビュー ===');
    console.log(preview + '...\n');

  } catch (error) {
    console.error('❌ リサーチエラー:', error.message);
    
    // エラー時はフォールバック
    const fallbackContent = `# リサーチ結果（フォールバック）

## トピック
${process.env.TOPIC || 'ラグジュアリーブランドの最新動向'}

## 思考メモ
${process.env.THINKING_MEMO || '（なし）'}

## 注意
リサーチAPIでエラーが発生したため、上記の情報のみで記事を生成します。
`;
    
    await fs.writeFile('research.md', fallbackContent);
    console.log('⚠️ フォールバックモードでresearch.mdを生成しました');
  }
}

conductResearch();
