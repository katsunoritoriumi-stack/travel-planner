const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function buildSystemInstruction(budgetStyle, tasks) {
    let instruction = `あなたは旅行プランニングの専門家です。
ユーザーの条件や希望を正確に反映した、実践的で詳細な旅行プランを日本語で作成してください。
回答はMarkdown形式で、見出し・箇条書きを活用して読みやすく整理してください。

`;

    const budgetInstructions = {
        economy: "【予算方針：とにかく安さ重視】\nコスト削減を最優先とし、LCCや格安宿を中心にした節約プランを提案してください。",
        economy_comfort: "【予算方針：安いが快適さ重視】\nなるべく費用を抑えつつ、宿泊や移動の質も一定以上に保つバランス重視のプランを提案してください。",
        comfort: "【予算方針：予算内で快適さ重視】\n無理な節約はせず、設定予算内で最も充実した、快適で質の高い体験を優先してください。"
    };

    instruction += budgetInstructions[budgetStyle] || budgetInstructions["economy_comfort"];
    instruction += "\n\n";

    if (tasks.includes("accommodation")) {
        instruction += "【宿泊・航空券】\n具体的な宿泊施設の候補と、効率的かつ予算に合った航空便の提案を含めてください。\n\n";
    }
    if (tasks.includes("sightseeing")) {
        instruction += "【日々の観光プラン】\n1日ごとの時系列に沿った詳細な観光ルート、移動手段、おすすめの食事時間を計画してください。\n\n";
    }
    if (tasks.includes("hidden_gems")) {
        instruction += "【穴場・マニアック情報 ── 最重要特別指示】\n観光ガイドブックや一般的なSNSで上位の場所は避け、地元民しか知らないマニアックな情報を提案してください。\n\n";
    }

    return instruction;
}

// Vercel Serverless Function ハンドラー
module.exports = async (req, res) => {
    // CORS 対応
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { destination, startDate, endDate, budget, budgetStyle, tasks, notes } = req.body;

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: buildSystemInstruction(budgetStyle, tasks || [])
        });

        const userPrompt = `旅行先：${destination}\n予算：${budget}\nメモ：${notes}`;

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const result = await model.generateContentStream(userPrompt);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    } catch (error) {
        console.error("Gemini API エラー:", error);
        res.status(500).json({ error: error.message });
    }
};
