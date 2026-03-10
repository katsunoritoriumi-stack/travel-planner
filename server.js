/**
 * server.js - バックエンドサーバー
 *
 * 役割：
 * - フロントエンド（index.html）からのリクエストを受け取る
 * - ユーザーの選択（予算スタイル・AIタスク）をもとに「システムプロンプト」を動的生成
 * - Anthropic Claude API に問い合わせて回答をストリーミング返却
 * - APIキーをサーバー側で管理し、フロントエンドに露出させない
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(".")); // index.html などの静的ファイルを配信

const client = new Anthropic.Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// システムプロンプト 動的生成関数
// ユーザーが選んだ「予算スタイル」と「AIタスク」を
// AIへの指示文（システムプロンプト）に組み込む
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildSystemPrompt(budgetStyle, tasks) {
    // 基本の役割定義
    let prompt = `あなたは旅行プランニングの専門家です。
ユーザーの条件や希望を正確に反映した、実践的で詳細な旅行プランを日本語で作成してください。
回答はMarkdown形式で、見出し・箇条書きを活用して読みやすく整理してください。

`;

    // ── 予算スタイルに応じた指示 ──────────────────────────────────
    // 「予算の使い道」プルダウンで選ばれた値によって、コストへの姿勢を変える
    const budgetInstructions = {
        economy:
            "【予算方針：とにかく安さ重視】\n" +
            "コスト削減を最優先としてください。LCC・夜行バス・ドミトリー・無料観光スポットなど、" +
            "最もリーズナブルな選択肢を積極的に提案してください。" +
            "「安さのトレードオフ」として生じる不便さも正直に伝えてください。",

        economy_comfort:
            "【予算方針：安いが快適さ重視】\n" +
            "なるべく費用を抑えつつ、睡眠の質・移動の疲労感など基本的な快適さは確保してください。" +
            "コストパフォーマンスが高いビジネスホテル・中距離電車・地元の食堂などを中心に提案してください。",

        comfort:
            "【予算方針：予算内で快適さ重視】\n" +
            "設定予算の範囲内で、できる限り快適で充実した体験を提案してください。" +
            "無理な節約よりも、体験の質・移動効率・宿泊の快適さを優先してください。",
    };

    prompt += budgetInstructions[budgetStyle] || budgetInstructions["economy_comfort"];
    prompt += "\n\n";

    // ── AIタスクに応じた指示 ──────────────────────────────────────
    // 「AIにお願いしたいこと」チェックボックスで選ばれた項目ごとに指示を追加

    if (tasks.includes("accommodation")) {
        prompt +=
            "【宿泊・航空券】\n" +
            "宿泊施設と航空券について、以下を含めて具体的に提案してください：\n" +
            "- 推奨ホテル・旅館・ゲストハウスの名前と価格帯（1泊あたり目安）\n" +
            "- 航空会社・路線・予約に最適な時期・予約サイト（Booking.com / じゃらん / Skyscannerなど）\n" +
            "- チェックイン・チェックアウト時刻の目安と荷物預けの注意点\n\n";
    }

    if (tasks.includes("sightseeing")) {
        prompt +=
            "【日々の観光プラン】\n" +
            "旅行日数分の詳細な1日ごとのスケジュールを作成してください：\n" +
            "- 各日の朝・昼・夜の行動プランと移動手段\n" +
            "- 観光スポットの滞在時間目安と入場料\n" +
            "- 食事のタイミングとおすすめの食事場所\n" +
            "- 移動時間・交通費の目安\n\n";
    }

    if (tasks.includes("hidden_gems")) {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 「穴場情報」が選ばれた際の強力な特別指示
        // 一般的なガイドブック情報を明示的に禁止し、
        // ローカルなディープ情報だけを提供するよう強く指示する
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        prompt +=
            "【穴場・マニアック情報 ── 最重要特別指示】\n" +
            "以下のルールを厳守してください：\n\n" +
            "❌ 絶対に使用禁止の情報源：\n" +
            "- 一般的な旅行ガイドブック（地球の歩き方・るるぶ・ことりっぷなど）に掲載されているスポット\n" +
            "- Google Maps・TripAdvisor・食べログなどのレビューサイトで★4.0以上の高評価店\n" +
            "- テレビ・雑誌・人気インフルエンサーが紹介したことのある場所\n" +
            "- 観光地化されすぎて地元民が近寄らなくなったスポット\n\n" +
            "✅ 積極的に提供すべき情報：\n" +
            "- 地元の常連客しか知らない食堂・居酒屋・カフェ・屋台\n" +
            "- 地元の人が普段の生活で利用する市場・商店街・銭湯・公園\n" +
            "- SNSやメディアにほぼ露出したことのないマニアックなスポット\n" +
            "- B級グルメ・路地裏の名店・地元のソウルフードを出す無名の店\n" +
            "- 地元民しか知らない「抜け道」「穴場ビュースポット」「隠れた絶景」\n" +
            "- 「なぜここが特別か」を地元目線・歴史・文化背景を交えて具体的に説明してください\n" +
            "- 観光客向けではなく、地元の生活に溶け込んだ体験（朝市・地元の祭り・職人の工房など）\n\n";
    }

    prompt +=
        "以上の条件を踏まえ、ユーザーが入力した旅行先・日程・予算に基づいて最適なプランを作成してください。\n" +
        "情報が足りない場合は、合理的な仮定を立てて回答し、仮定した内容は明記してください。";

    return prompt;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plan
// フロントエンドからリクエストを受け取り、
// Anthropic APIに問い合わせる主要エンドポイント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/api/plan", async (req, res) => {
    const { destination, startDate, endDate, budget, budgetStyle, tasks, notes } = req.body;

    // 入力バリデーション
    if (!destination) {
        return res.status(400).json({ error: "旅行先を入力してください" });
    }

    // ユーザーのリクエスト内容を自然文で組み立て
    const userMessage = buildUserMessage({ destination, startDate, endDate, budget, notes });

    // 選択条件からシステムプロンプトを動的生成
    const systemPrompt = buildSystemPrompt(budgetStyle, tasks || []);

    try {
        // ストリーミングレスポンスの設定
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Anthropic Claude API へストリーミングリクエスト
        const stream = client.messages.stream({
            model: "claude-opus-4-5",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [
                {
                    role: "user",
                    content: userMessage,
                },
            ],
        });

        // ストリームのテキストをリアルタイムでフロントエンドへ転送
        stream.on("text", (text) => {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
        });

        // ストリーム完了
        stream.on("finalMessage", () => {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        });

        // エラー処理
        stream.on("error", (err) => {
            console.error("Anthropic API エラー:", err);
            res.write(`data: ${JSON.stringify({ error: "API接続エラーが発生しました" })}\n\n`);
            res.end();
        });
    } catch (error) {
        console.error("サーバーエラー:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "サーバーエラーが発生しました: " + error.message });
        }
    }
});

// ユーザー入力から自然文のメッセージを生成するヘルパー関数
function buildUserMessage({ destination, startDate, endDate, budget, notes }) {
    let message = `旅行先：${destination}\n`;

    if (startDate && endDate) {
        message += `期間：${startDate} 〜 ${endDate}\n`;
    } else if (startDate) {
        message += `出発日：${startDate}\n`;
    }

    if (budget) {
        message += `予算：${budget}\n`;
    }

    if (notes) {
        message += `その他の希望・メモ：${notes}\n`;
    }

    message += "\n上記の条件に合った旅行プランを作成してください。";
    return message;
}

// サーバー起動
app.listen(PORT, () => {
    console.log(`\n🌏 旅行プランアプリ サーバー起動中`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🔑 APIキー設定: ${process.env.ANTHROPIC_API_KEY ? "✅ 設定済み" : "❌ 未設定（.envファイルを確認してください）"}\n`);
});
