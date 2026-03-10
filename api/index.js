require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json());

const client = new Anthropic.Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildSystemPrompt(budgetStyle, tasks) {
    let prompt = `あなたは旅行プランニングの専門家です。
ユーザーの条件や希望を正確に反映した、実践的で詳細な旅行プランを日本語で作成してください。
回答はMarkdown形式で、見出し・箇条書きを活用して読みやすく整理してください。

`;

    const budgetInstructions = {
        economy: "【予算方針：とにかく安さ重視】\nコスト削減を最優先としてください。",
        economy_comfort: "【予算方針：安いが快適さ重視】\nなるべく費用を抑えつつ快適さを確保してください。",
        comfort: "【予算方針：予算内で快適さ重視】\n設定予算の範囲内で、最高のエクスペリエンスを提案してください。"
    };

    prompt += budgetInstructions[budgetStyle] || budgetInstructions["economy_comfort"];
    prompt += "\n\n";

    if (tasks.includes("accommodation")) {
        prompt += "【宿泊・航空券】\n宿泊施設と航空券について具体的に提案してください。\n\n";
    }
    if (tasks.includes("sightseeing")) {
        prompt += "【日々の観光プラン】\n詳細な1日ごとのスケジュールを作成してください。\n\n";
    }
    if (tasks.includes("hidden_gems")) {
        prompt += "【穴場・マニアック情報 ── 最重要特別指示】\n一般的なガイドブックや★4以上の店は避け、地元民しか知らないディープな情報のみを提供してください。\n\n";
    }

    return prompt;
}

app.post("/api/plan", async (req, res) => {
    const { destination, startDate, endDate, budget, budgetStyle, tasks, notes } = req.body;

    const systemPrompt = buildSystemPrompt(budgetStyle, tasks || []);
    const userMessage = `旅行先：${destination}\n予算：${budget}\nメモ：${notes}`;

    try {
        const stream = await client.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
            stream: true,
        });

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        for await (const event of stream) {
            if (event.type === "content_block_delta") {
                res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
            }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;
