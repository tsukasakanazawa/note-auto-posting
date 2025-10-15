import fs from 'fs';
import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function conductResearch(topic, targetAudience, keywords) {
  console.log('=== リサーチ開始 ===');
  console.log(`トピック: ${topic}`);
  console.log(`ターゲット: ${targetAudience}`);
  console.log(`キーワード: ${keywords}`);

  try {
    const researchPrompt = `
あなたは優秀なリサーチャーです。以下の条件で詳細なリサーチを行ってください。

## リサーチ条件
- トピック: ${topic}
- ターゲット読者: ${targetAudience}
- キーワード: ${keywords}

## リサーチ内容
1. ${topic}の基本概念と定義
2. ${targetAudience}が抱える課題・悩み
3. ${keywords}に関連する最新トレンド
4. 具体的な事例・統計データ
5. 解決策・アプローチ方法
6. 注意点・落とし穴

## 出力形式
マークダウン形式で、見出しと内容を明確に分けて出力してください。
データは正確で、実用的な情報を含めてください。
`;

    console.log('Claude APIに問い合わせ中...');
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: researchPrompt
      }]
    });

    const researchContent = message.content[0].text;
    console.log('リサーチ完了。research.mdを作成中...');

    // research.mdに保存
    fs.writeFileSync('research.md', researchContent, 'utf8');
    
    console.log('research.md作成完了');
    console.log(`ファイルサイズ: ${fs.statSync('research.md').size} bytes`);
    
    return true;
  } catch (error) {
    console.error('リサーチエラー:', error);
    
    // エラー時でも基本的なresearch.mdを作成
    const fallbackContent = `# ${topic} リサーチ結果

## 概要
${targetAudience}向けの${topic}に関する基本情報

## キーワード
${keywords}

## 課題
- 情報収集の自動化
- 効率的なワークフロー構築
- 品質の保持

## 解決策
- AI技術の活用
- プロセスの標準化
- 継続的な改善

## 注意点
- データの正確性確認
- 定期的な更新
- セキュリティ対策

*注: APIエラーのためフォールバック内容を使用*
`;
    
    fs.writeFileSync('research.md', fallbackContent, 'utf8');
    console.log('フォールバック research.md 作成完了');
    return false;
  }
}

// コマンドライン引数から値を取得
const [,, topic, targetAudience, keywords] = process.argv;

if (!topic || !targetAudience || !keywords) {
  console.error('使用法: node research.mjs <topic> <targetAudience> <keywords>');
  process.exit(1);
}

// リサーチ実行
conductResearch(topic, targetAudience, keywords)
  .then((success) => {
    if (success) {
      console.log('=== リサーチ正常完了 ===');
      process.exit(0);
    } else {
      console.log('=== リサーチ部分完了（フォールバック使用） ===');
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error('=== リサーチ失敗 ===', error);
    process.exit(1);
  });
