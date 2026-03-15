const { GoogleGenerativeAI } = require("@google/generative-ai");

function buildSystemInstruction(budgetStyle, tasks, transport) {
    const transportInstructions = {
        any: "移動手段はコスト・時間・利便性を考慮して最適なものを提案してください。",
        plane: "主な移動手段は飛行機（LCC含む）を前提にしてください。航空会社・料金目安・予約リンクを必ず記載してください。",
        train: "主な移動手段は電車・新幹線を前提にしてください。路線・所要時間・料金目安・予約リンクを必ず記載してください。",
        car: "主な移動手段はレンタカー・ドライブを前提にしてください。レンタカー会社・料金目安・予約リンクを必ず記載してください。",
        bus: "主な移動手段は高速バス・夜行バスを前提にしてください。バス会社・路線・料金目安・予約リンクを必ず記載してください。"
    };

    let instruction = `あなたは旅行プランニングの専門家です。
ユーザーの条件や希望を正確に反映した、実践的で詳細な旅行プランを日本語で作成してください。
回答はMarkdown形式で、見出し・箇条書きを活用して読みやすく整理してください。

【最重要】ユーザーが選択したセクションのみを出力してください。選択されていないセクション（例：観光プランが未選択なら日程表・スケジュールなど）は絶対に出力しないでください。

${transportInstructions[transport] || transportInstructions["any"]}

【リンクルール】
プラン内に登場するすべての施設・店・スポット・交通手段に、必ず以下の検索クエリ型URLでMarkdownリンクを付けること。
/A2403/ のような深いパスや個別ページURLは絶対に生成禁止。「施設名」「店名」「スポット名」は実際の名称に置き換えること。

- 宿泊施設: [Booking.com](https://www.booking.com/search.html?ss=施設名) [じゃらん](https://www.jalan.net/yad/?keyword=施設名)
- レストラン: [Googleマップ](https://www.google.com/maps/search/店名+都市名) [食べログ](https://tabelog.com/rstLst/?sk=店名)
- 観光スポット: [Googleマップ](https://www.google.com/maps/search/スポット名+都市名)
- 飛行機: [Googleフライト](https://www.google.com/travel/flights) [スカイスキャナー](https://www.skyscanner.jp/)
- 電車・新幹線: [えきねっと](https://www.eki-net.com/) [Yahoo!乗換](https://transit.yahoo.co.jp/)
- レンタカー: [楽天レンタカー](https://car.rakuten.co.jp/) [じゃらんレンタカー](https://www.jalan.net/rentacar/)
- 高速バス: [バス比較なび](https://www.bushikaku.net/) [楽天バス](https://bus.rakuten.co.jp/)

`;

    const budgetInstructions = {
        economy: "【予算方針：とにかく安さ重視】\nコスト削減を最優先とし、LCCや格安宿を中心にした節約プランを提案してください。",
        economy_comfort: "【予算方針：安いが快適さ重視】\nなるべく費用を抑えつつ、宿泊や移動の質も一定以上に保つバランス重視のプランを提案してください。",
        comfort: "【予算方針：予算内で快適さ重視】\n無理な節約はせず、設定予算内で最も充実した、快適で質の高い体験を優先してください。"
    };

    instruction += budgetInstructions[budgetStyle] || budgetInstructions["economy_comfort"];
    instruction += "\n\n";

    if (tasks.includes("accommodation")) {
        instruction += `【宿泊・航空券】
宿泊施設については以下を必ず記載してください：
- 施設名・エリア・特徴の紹介
- 1泊あたりの料金目安（例：¥8,000〜¥12,000/泊）
- 滞在日数分の宿泊費合計目安

航空券については以下を必ず記載してください：
- 推奨航空会社・便名（または路線の種類：LCC/FSC）
- 往復の料金目安（例：¥30,000〜¥45,000/人）
- 予約に最適なサイト・アプリ名（例：Skyscanner、Googleフライト、各社公式）
- 早割・セール時期など節約のコツ

\n`;
    }
    if (tasks.includes("sightseeing")) {
        instruction += `【日々の観光プラン】
1日ごとに以下の形式で記載してください：
- 時系列の観光ルートと移動手段
- 食事のタイミングとおすすめ店
- その日の【予算配分】を必ず末尾に記載すること：
  例）
  📊 Day X 予算配分
  　交通費：約¥1,500
  　食費：約¥3,000（朝¥500／昼¥1,000／夜¥1,500）
  　入場料・観光費：約¥2,000
  　その他（お土産など）：約¥1,000
  　━━━━━━━━━━━━
  　Day X 合計：約¥7,500

\n`;
    }
    if (tasks.includes("hidden_gems")) {
        instruction += "【穴場・マニアック情報 ── 最重要特別指示】\n" +
            "観光ガイドブックや有名なレビューサイト、SNSでバズっている場所は意図的に避けてください。\n" +
            "代わりに、その土地の人が通う小さなお店、看板のない名店、知る人ぞ知る絶景など、地元の文化が色濃く残るマニアックな情報を重点的に提案してください。\n" +
            "「なぜここが穴場なのか」の解説を必ず添えてください。\n\n";
    }

    instruction += `【リンク挿入ルール ── 必須】
プラン内に登場するすべての要素に、以下のルールでMarkdownリンクを付けること。
URLは実在する検索・予約サイトの検索結果URLを使うこと。架空・推測URLは禁止。

■ 航空券
スカイスキャナー検索: https://www.skyscanner.jp/
Googleフライト: https://www.google.com/travel/flights
各LCC公式（ピーチ）: https://www.flypeach.com/
各LCC公式（ジェットスター）: https://www.jetstar.com/jp/

■ 宿泊施設
施設名の後に以下のリンクを付ける：
- [booking.comで検索](https://www.booking.com/search.html?ss=施設名をURLエンコード)
- [じゃらんで検索](https://www.jalan.net/)
- [Airbnbで検索](https://www.airbnb.jp/)

■ レストラン・グルメ
- [食べログで検索](https://tabelog.com/)
- [Googleマップで検索](https://www.google.com/maps/search/店名)

■ 観光スポット
- [Googleマップで見る](https://www.google.com/maps/search/スポット名)
- [TripAdvisorで見る](https://www.tripadvisor.jp/)

■ レンタカー
- [楽天トラベルレンタカー](https://car.rakuten.co.jp/)
- [タイムズカーレンタル](https://rental.timescar.jp/)
- [じゃらんレンタカー](https://www.jalan.net/rentacar/)

各項目の書き方の例：
- 宿泊：**〇〇ホテル**（1泊¥8,000〜）[booking.comで検索](https://www.booking.com/search.html?ss=%E3%83%9B%E3%83%86%E3%83%AB%E5%90%8D)
- 観光：**〇〇神社** [Googleマップ](https://www.google.com/maps/search/〇〇神社)
- グルメ：**〇〇食堂** [食べログ](https://tabelog.com/) [Googleマップ](https://www.google.com/maps/search/〇〇食堂)
- 航空券：[スカイスキャナーで検索](https://www.skyscanner.jp/) / [Googleフライト](https://www.google.com/travel/flights)

以上の制約をすべて厳守し、提供された旅行条件に基づいて最高なプランを作ってください。`;
    return instruction;
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { destination, startDate, endDate, budget, budgetStyle, transport, tasks, notes } = req.body;

    if (!destination) {
        return res.status(400).json({ error: "旅行先を入力してください" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY が設定されていません" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const transportLabels = { any:"おまかせ", plane:"飛行機", train:"電車・新幹線", car:"レンタカー", bus:"高速バス" };
    const systemInstruction = buildSystemInstruction(budgetStyle, tasks || [], transport || "any");
    const userPrompt = `旅行先：${destination}\n期間：${startDate} 〜 ${endDate}\n予算：${budget}\n移動手段：${transportLabels[transport]||"おまかせ"}\nその他の希望：${notes}`;

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
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
