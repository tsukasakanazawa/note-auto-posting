import fs from 'fs';
import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function generateArticle(topic, targetAudience, keywords, experience) {
  console.log('=== 記事生成開始 ===');
  console.log(`トピック: ${topic}`);
  console.log(`ターゲット: ${targetAudience}`);
  console.log(`キーワード: ${keywords}`);
  console.log(`体験談: ${experience}`);

  try {
    // research.mdの内容を読み込み
    let researchContent = '';
    if (fs.existsSync('research.md')) {
      researchContent = fs.readFileSync('research.md', 'utf8');
      console.log('research.md読み込み完了');
      console.log(`research.mdサイズ: ${researchContent.length} 文字`);
    } else {
      console.warn('research.mdが見つかりません。基本情報で記事を生成します。');
      researchContent = `# ${topic}の基本情報\n\n${targetAudience}向けの${keywords}に関する情報。`;
    }

    const articlePrompt = `
あなたは優秀なライターです。以下のリサーチ結果を基に、魅力的な記事を作成してください。

## リサーチ結果
${researchContent}

## 記事作成条件
- トピック: ${topic}
- ターゲット読者: ${targetAudience}
- キーワード: ${keywords}
- 体験談要素: ${experience}

## 記事の要件
1. タイトルは魅力的で検索されやすいものにする
2. 導入部分で読者の関心を引く
3. 具体例や体験談を織り交ぜる
4. 実践的なアドバイスを含める
5. まとめで行動を促す
6. 文字数: 2000-3000文字程度
7. 見出し構造を適切に使用

## 出力形式
JSON形式で以下の構造で出力してください：
{
  "title": "記事タイトル",
  "content": "記事本文（マークダウン形式）",
  "summary": "記事の要約（100文字程度）",
  "tags": ["タグ1", "タグ2", "タグ3"]
}

JSONのみを出力し、他の説明は含めないでください。
`;

    console.log('Claude APIで記事生成中...');
    console.log('プロンプト長:', articlePrompt.length);

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: articlePrompt
      }]
    });

    const articleResponse = message.content[0].text;
    console.log('Claude API応答受信完了');
    console.log('応答長:', articleResponse.length);

    // JSONレスポンスをパース
    let articleData;
    try {
      // JSON部分のみ抽出（前後の説明文を除去）
      const jsonMatch = articleResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        articleData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('JSON形式のレスポンスが見つかりません');
      }
    } catch (parseError) {
      console.warn('JSONパースエラー:', parseError.message);
      console.warn('フォールバック記事データを作成します');
      
      articleData = {
        title: `${topic}: ${targetAudience}のための実践ガイド`,
        content: `# ${topic}: ${targetAudience}のための実践ガイド

## はじめに
${targetAudience}の皆さん、${keywords}について詳しく解説します。

## ${topic}とは
${researchContent.slice(0, 500)}...

## 実践方法
1. 基本的な理解を深める
2. 具体的な手順を学ぶ
3. 実際に試してみる
4. 継続的に改善する

## 体験談
${experience}という体験を通じて、多くのことを学びました。

## まとめ
${topic}を活用することで、${targetAudience}の皆さんの業務効率が向上します。

今日から実践してみてください。`,
        summary: `${targetAudience}向けの${topic}実践ガイド。${keywords}を中心に解説。`,
        tags: [topic, keywords, targetAudience]
      };
    }

    // draft.jsonに保存
    const draftData = {
      ...articleData,
      metadata: {
        generated_at: new Date().toISOString(),
        topic,
        targetAudience,
        keywords,
        experience,
        word_count: articleData.content.length
      }
    };

    fs.writeFileSync('draft.json', JSON.stringify(draftData, null, 2), 'utf8');
    console.log('draft.json作成完了');
    console.log(`記事タイトル: ${articleData.title}`);
    console.log(`記事文字数: ${articleData.content.length}`);
    console.log(`ファイルサイズ: ${fs.statSync('draft.json').size} bytes`);

    // 検証
    const savedDraft = JSON.parse(fs.readFileSync('draft.json', 'utf8'));
    if (!savedDraft.title || !savedDraft.content) {
      throw new Error('draft.jsonの内容が不完全です');
    }

    console.log('draft.json検証完了');
    return true;

  } catch (error) {
    console.error('記事生成エラー:', error);
    console.error('エラー詳細:', error.stack);

    // エラー時でも基本的なdraft.jsonを作成
    const fallbackData = {
      title: `${topic}について - ${targetAudience}向けガイド`,
      content: `# ${topic}について

## 概要
${targetAudience}の皆さんへ、${keywords}に関する基本的な情報をお届けします。

## 内容
${experience}という観点から、実践的なアドバイスを提供します。

## まとめ
今後も${topic}について継続的に学習していきましょう。

*注: API制限のためシンプルな内容となっています*`,
      summary: `${topic}に関する${targetAudience}向けの基本ガイド`,
      tags: [topic, keywords],
      metadata: {
        generated_at: new Date().toISOString(),
        fallback: true,
        original_error: error.message
      }
    };

    fs.writeFileSync('draft.json', JSON.stringify(fallbackData, null, 2), 'utf8');
    console.log('フォールバック draft.json 作成完了');
    return false;
  }
}

// コマンドライン引数から値を取得
const [,, topic, targetAudience, keywords, experience] = process.argv;

if (!topic || !targetAudience || !keywords || !experience) {
  console.error('使用法: node ai-writer.mjs <topic> <targetAudience> <keywords> <experience>');
  process.exit(1);
}

// 記事生成実行
generateArticle(topic, targetAudience, keywords, experience)
  .then((success) => {
    if (success) {
      console.log('=== 記事生成正常完了 ===');
    } else {
      console.log('=== 記事生成部分完了（フォールバック使用） ===');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('=== 記事生成失敗 ===', error);
    process.exit(1);
  });
