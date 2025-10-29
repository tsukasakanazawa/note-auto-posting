import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function conductDailyResearch() {
  try {
    console.log('=== ラグジュアリーブランド業界 朝刊リサーチ開始 ===');
    console.log('日付:', new Date().toLocaleDateString('ja-JP'));

    const researchPrompt = `
あなたはラグジュアリーブランド業界の情報収集のプロフェッショナルです。

## ミッション
Bloombergの「1日を始める前に読んでおきたいニュース5本」のラグジュアリーブランド版を作成するための、過去24時間の重要ニュースをリサーチしてください。

## リサーチ対象
1. **主要ブランドの動向**
   - LVMH、Kering、Richemont、Hermès、Chanelなど
   - 新規出店、閉店、リニューアル
   - 決算発表、業績予想修正

2. **市場動向**
   - 中国・日本・米国・欧州の消費トレンド
   - 為替、株価の影響
   - 業界全体の成長率・予測

3. **戦略・経営**
   - 経営者の交代、組織変更
   - M&A、提携、資本参加
   - デジタル戦略、サステナビリティ施策

4. **クリエイティブ**
   - デザイナーの異動
   - コラボレーション発表
   - 重要なコレクション発表

5. **業界を超えたトレンド**
   - ファッション、アート、建築、音楽
   - セレブリティの動き
   - 文化的・社会的な変化

## 出力形式

以下のMarkdown形式で出力してください:

# ラグジュアリーブランド業界の朝刊 - リサーチ結果

## 日付
${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}

## 今日の注目ニュース TOP 5

### 1. [見出し]
- **概要**: （100文字以内）
- **重要度**: ★★★★★（5段階）
- **影響**: 業界全体 / 特定ブランド / 市場
- **データ**: （具体的な数字があれば）
- **出典**: URL

### 2. [見出し]
（同様の形式）

### 3. [見出し]
（同様の形式）

### 4. [見出し]
（同様の形式）

### 5. [見出し]
（同様の形式）

## その他の注目ニュース（3-5個）
- **[見出し]**: （50文字以内の概要）
- **[見出し]**: （50文字以内の概要）

## 今日のキーワード
#キーワード1 #キーワード2 #キーワード3

## 参考情報源
- [情報源1](URL1)
- [情報源2](URL2)
- [情報源3](URL3)
- [情報源4](URL4)
- [情報源5](URL5)

---

**注意**: 
- 必ず過去24-48時間以内の最新情報を優先してください
- 具体的な企業名、ブランド名、数字、日付を明記してください
- 信頼できる情報源（公式発表、Bloomberg、WWD、BOF、日経など）を優先してください
`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [{ role: 'user', content: researchPrompt }]
    });

    const researchResult = message.content[0].text;
    
    await fs.writeFile('research.md', researchResult);
    console.log('✅ リサーチ完了: research.md を生成しました');
    console.log('リサーチ結果の長さ:', researchResult.length, '文字');

  } catch (error) {
    console.error('❌ リサーチエラー:', error.message);
    
    // フォールバック
    const fallbackContent = `# ラグジュアリーブランド業界の朝刊 - リサーチ結果

## 日付
${new Date().toLocaleDateString('ja-JP')}

## 注意
リサーチAPIでエラーが発生しました。一般的な業界トレンドに基づいて記事を生成します。
`;
    
    await fs.writeFile('research.md', fallbackContent);
    console.log('⚠️ フォールバックモードでresearch.mdを生成しました');
  }
}

conductDailyResearch();
