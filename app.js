/**
 * app.js - フロントエンドJavaScript
 *
 * 役割：
 * 1. フォームの送信を処理する
 * 2. ユーザーが選んだ「予算スタイル」と「AIタスク（チェックボックス）」を収集する
 * 3. バックエンド（/api/plan）にデータを送信する
 * 4. ストリーミングで返ってくるAIの回答をリアルタイムに表示する
 * 5. MarkdownをHTMLに変換してレンダリングする
 * 6. 背景の星空アニメーションを描画する
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOM要素の取得（ページがロードされたら始まる）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.addEventListener("DOMContentLoaded", () => {
    // フォーム要素
    const form = document.getElementById("travel-form");
    const submitBtn = document.getElementById("submit-btn");

    // 結果表示エリア
    const resultSection = document.getElementById("result-section");
    const loadingIndicator = document.getElementById("loading-indicator");
    const resultContent = document.getElementById("result-content");

    // コピーボタン
    const copyBtn = document.getElementById("copy-btn");

    // AIの回答テキストを蓄積するバッファ
    let fullResponseText = "";

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // フォーム送信イベント
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    form.addEventListener("submit", async (e) => {
        e.preventDefault(); // デフォルトのページリロードを防止

        // ── 入力値の収集 ─────────────────────────────────────

        // テキスト入力
        const origin = document.getElementById("origin").value.trim();
        const destination = document.getElementById("destination").value.trim();
        const startDate = document.getElementById("start-date").value;
        const endDate = document.getElementById("end-date").value;
        const budget = document.getElementById("budget").value.trim();
        const notes = document.getElementById("notes").value.trim();

        // 「予算の使い道」プルダウンの選択値を取得
        // value は "economy" / "economy_comfort" / "comfort" のいずれか
        const budgetStyle = document.getElementById("budget-style").value;
        const transport = document.getElementById("transport").value;

        // 「AIにお願いしたいこと」チェックボックスの選択値を配列で取得
        // querySelectorAll で name="tasks" の checked されたものだけを集める
        const checkedTasks = Array.from(
            document.querySelectorAll('input[name="tasks"]:checked')
        ).map((cb) => cb.value);
        // 例: ["accommodation", "sightseeing", "hidden_gems"]

        // バリデーション
        if (!origin) {
            shakeInput(document.getElementById("origin"));
            return;
        }
        if (!destination) {
            shakeInput(document.getElementById("destination"));
            return;
        }

        // ── UI の切り替え ────────────────────────────────────

        fullResponseText = "";
        resultContent.innerHTML = "";
        submitBtn.disabled = true;
        submitBtn.querySelector(".btn-text").textContent = "プランを探索中...";

        // 結果セクションを表示してローディング開始
        resultSection.removeAttribute("hidden");
        loadingIndicator.removeAttribute("hidden");
        resultSection.scrollIntoView({ behavior: "smooth", block: "start" });

        // ── バックエンドへリクエスト ────────────────────────────

        try {
            const response = await fetch("/api/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    origin,
                    destination,
                    startDate,
                    endDate,
                    budget,
                    budgetStyle,
                    transport,
                    tasks: checkedTasks,
                    notes,
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `サーバーエラー (${response.status})`);
            }

            // ── ストリーミングレスポンスを読み取る ─────────────────

            // サーバーから text/event-stream 形式でテキストが随時届く
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            loadingIndicator.setAttribute("hidden", "");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // 受け取ったバイナリをテキストに変換
                const chunk = decoder.decode(value, { stream: true });

                // Server-Sent Events の "data: {...}" 行を解析
                const lines = chunk.split("\n");
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const payload = JSON.parse(line.slice(6));

                        if (payload.done) {
                            // 完了 - 最終レンダリング
                            renderMarkdown(fullResponseText);
                            break;
                        }
                        if (payload.error) {
                            throw new Error(payload.error);
                        }
                        if (payload.text) {
                            // テキストを蓄積しながらリアルタイムレンダリング
                            fullResponseText += payload.text;
                            renderMarkdown(fullResponseText);
                        }
                    } catch {
                        // JSON解析エラーは無視（不完全なチャンクの場合）
                    }
                }
            }
        } catch (error) {
            // エラー表示
            loadingIndicator.setAttribute("hidden", "");
            resultContent.innerHTML = `
        <div style="color: #e07070; padding: 1rem; border: 1px solid rgba(224,112,112,0.3); border-radius: 10px;">
          <strong>⚠️ エラーが発生しました</strong><br>${escapeHtml(error.message)}
          <br><br>
          <small>・サーバーが起動しているか確認してください<br>
          ・Vercelの環境変数にGEMINI_API_KEYが設定されているか確認してください</small>
        </div>`;
        } finally {
            // ボタンを元に戻す
            submitBtn.disabled = false;
            submitBtn.querySelector(".btn-text").textContent = "旅のプランを生成する";
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Markdownを簡易HTMLに変換してレンダリング
    // （外部ライブラリ不使用のシンプルな実装）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    function renderMarkdown(text) {
        // Step1: [label](url) をエスケープ前に退避（URLが壊れるのを防ぐ）
        const links = [];
        const safe = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
            // booking.com・じゃらん・食べログは検索精度が低いためGoogleマップに統一
            const normalizedUrl = (url.includes("booking.com") || url.includes("jalan.net/yad") || url.includes("tabelog.com/rstLst"))
                ? `https://www.google.com/maps/search/${encodeURIComponent(label)}`
                : url;
            links.push(`<a href="${normalizedUrl}" target="_blank" rel="noopener noreferrer" style="color:#c9a84c;word-break:break-all;text-decoration:underline;transition:opacity 0.2s,transform 0.15s;display:inline-block;" onmouseover="this.style.opacity='0.7';this.style.transform='translateY(-1px)'" onmouseout="this.style.opacity='1';this.style.transform='translateY(0)'">${label}</a>`);
            return `%%L${links.length - 1}%%`;
        });

        // Step2: 通常のMarkdown変換
        let html = escapeHtml(safe)
            .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
            .replace(/^### (.+)$/gm, "<h3>$1</h3>")
            .replace(/^## (.+)$/gm, "<h2>$2</h2>")
            .replace(/^# (.+)$/gm, "<h1>$1</h1>")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/`(.+?)`/g, "<code>$1</code>")
            .replace(/^---$/gm, "<hr>")
            .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
            .replace(/^[•\-\*] (.+)$/gm, "<li>$1</li>")
            .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
            .replace(/\n\n/g, "<br><br>")
            .replace(/\n/g, "<br>");

        html = html.replace(/(<li>(?:.*?<br>)*?.*?<\/li>(?:<br>)?)+/g, (m) => `<ul>${m.replace(/<br>/g,"")}</ul>`);

        // Step3: プレースホルダーをリンクタグに戻す
        html = html.replace(/%%L(\d+)%%/g, (_, i) => links[+i]);

        resultContent.innerHTML = html;
    }

    // HTMLエスケープ（XSS防止）
    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // コピーボタン
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    copyBtn.addEventListener("click", async () => {
        if (!fullResponseText) return;
        try {
            await navigator.clipboard.writeText(fullResponseText);
            copyBtn.textContent = "✅ コピー完了";
            setTimeout(() => { copyBtn.textContent = "📋 コピー"; }, 2000);
        } catch {
            copyBtn.textContent = "❌ コピー失敗";
            setTimeout(() => { copyBtn.textContent = "📋 コピー"; }, 2000);
        }
    });

    // 入力エラー時のシェイクアニメーション
    function shakeInput(el) {
        el.style.animation = "none";
        el.style.borderColor = "#e07070";
        el.style.boxShadow = "0 0 0 3px rgba(224, 112, 112, 0.25)";
        el.focus();
        setTimeout(() => {
            el.style.borderColor = "";
            el.style.boxShadow = "";
        }, 1800);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 星空アニメーション（Canvas）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const canvas = document.getElementById("starfield");
    const ctx = canvas.getContext("2d");

    // 星のデータを生成
    const STAR_COUNT = 180;
    const stars = [];

    function initStars() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        stars.length = 0;

        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.4 + 0.3,       // 半径
                opacity: Math.random() * 0.6 + 0.15,       // 透明度
                speed: Math.random() * 0.0008 + 0.0002,  // 瞬き速度
                phase: Math.random() * Math.PI * 2,      // 位相オフセット
            });
        }
    }

    let frameId = null;
    function animateStars(time) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const star of stars) {
            // サイン波で瞬きエフェクト
            const twinkle = Math.sin(time * star.speed * 1000 + star.phase) * 0.35 + 0.65;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(220, 200, 160, ${star.opacity * twinkle})`;
            ctx.fill();
        }

        frameId = requestAnimationFrame((t) => animateStars(t / 1000));
    }

    initStars();
    animateStars(0);

    window.addEventListener("resize", () => {
        cancelAnimationFrame(frameId);
        initStars();
        animateStars(0);
    });
});
