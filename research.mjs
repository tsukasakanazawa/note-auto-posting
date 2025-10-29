import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function conductDailyResearch() {
  try {
    console.log('=== ラグジュアリーブランド業界 朝刊リサーチ開始 ===');

    const researchPrompt = `
あなたはラグジュアリーブランド業界のリサーチャーです。

過去24時間の重要ニュースをリサーチし、Bloomberg「Five Things」風の朝刊を作成するための情報を収集してください。

## リサーチ対象
- LVMH、Kering、Hermès、Chanel等の主要ブランド動向
- 市場動向（中国・日本・米国・欧州）
- 経営・戦略（M&A、人事、業績）
- クリエイティブ（デザイナー、コレクション）

## 出力形式

# ラグジュアリーブランド業界の朝刊 - リサーチ

## 今日の注目ニュース TOP 5

### 1. [見出し]
- 概要: （100文字）
- 重要度: ★★★★★
- データ: （具体的な数字）
- 出典: URL

### 2. [見出し]
（同様）

### 3. [見出し]
（同様）

### 4. [見出し]
（同様）

### 5. [見出し]
（同様）

## その他の注目ニュース
- [ニュース6]
- [ニュース7]
- [ニュース8]

## 参考情報源
- [情報源1](URL1)
- [情報源2](URL2)
- [情報源3](URL3)
`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [{ role: 'user', content: researchPrompt }]
    });

    const researchResult = message.content[0].text;
    await fs.writeFile('research.md', researchResult);
    console.log('✅ リサーチ完了');

  } catch (error) {
    console.error('❌ リサーチエラー:', error.message);
    const fallback = `# リサーチ結果\n\nエラーが発生しました。一般的な業界トレンドで記事を生成します。`;
    await fs.writeFile('research.md', fallback);
  }
}

conductDailyResearch();

