const { GoogleGenerativeAI } = require("@google/generative-ai");

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
        instruction += "【穴場・マニアック情報 ── 最重要特別指示】\n" +
            "観光ガイドブックや有名なレビューサイト、SNSでバズっている場所は意図的に避けてください。\n" +
            "代わりに、その土地の人が通う小さなお店、看板のない名店、知る人ぞ知る絶景など、地元の文化が色濃く残るマニアックな情報を重点的に提案してください。\n" +
            "「なぜここが穴場なのか」の解説を必ず添えてください。\n\n";
    }

    instruction += "以上の制約に従い、提供された旅行条件に基づいて最高なプランを作ってください。";
    return instruction;
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { destination, startDate, endDate, budget, budgetStyle, tasks, notes } = req.body;

    if (!destination) {
        return res.status(400).json({ error: "旅行先を入力してください" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY が設定されていません" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const systemInstruction = buildSystemInstruction(budgetStyle, tasks || []);
    const userPrompt = `旅行先：${destination}\n期間：${startDate} 〜 ${endDate}\n予算：${budget}\nその他の希望：${notes}`;

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemInstruction
        });

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
        if (!res.headersSent) {
            res.status(500).json({ error: "Gemini API との通信に失敗しました: " + error.message });
        }
    }
};
