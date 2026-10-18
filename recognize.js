// api/recognize.js —— Vercel Serverless Function
// 前端 POST JSON: { "image": "data:image/jpeg;base64,xxxx" }
// 返回 JSON:      { "ingredients": [ { "name": "西红柿", "quantity": "2个" } ] }

export default async function handler(req, res) {
  // 允许本地直接打开 HTML 时跨域调用
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "只支持 POST" });

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "后端未配置 DASHSCOPE_API_KEY" });

  const { image } = req.body || {};
  if (!image) return res.status(400).json({ error: "缺少 image 字段" });

  // 国内账号用这个；国际站账号改成 https://dashscope-intl.aliyuncs.com/compatible-mode/v1
  const baseUrl =
    process.env.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.VISION_MODEL || "qwen-vl-max";

  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image } },
              {
                type: "text",
                text:
                  "请识别这张照片里所有可见的食材。只返回 JSON，不要任何其他文字，格式：" +
                  '{"ingredients":[{"name":"食材名称","quantity":"大致数量，看不出就留空"}]}',
              },
            ],
          },
        ],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: data?.error?.message || "模型接口调用失败" });
    }

    let text = data?.choices?.[0]?.message?.content || "";
    // 去掉模型可能带上的 ```json 代码块
    text = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "模型返回的不是有效 JSON", raw: text });
    }
    return res.status(200).json({ ingredients: parsed.ingredients || [] });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
