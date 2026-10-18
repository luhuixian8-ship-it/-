
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "只支持 POST" });
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "后端未配置 DASHSCOPE_API_KEY"
    });
  }

  const { image } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: "缺少 image 字段" });
  }

  const baseUrl = process.env.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.VISION_MODEL || "qwen-vl-max";

  const recognitionPrompt = `你是冰箱食材盘点助手。请认真查看整张图片，不要只识别最显眼的一两种食材。

请在内部依次检查以下区域（仅检查图片中实际可见的区域）：
1. 顶层置物架：从左至右查看食材。
2. 中层置物架：从左至右查看食材。
3. 下层置物架：从左至右查看食材。
4. 蔬菜抽屉、门侧和边角：查看前景、后方及部分露出的食材。
如果不是冰箱内部照片，则按画面从上到下、从左到右检查。

识别规则：
- 尽可能覆盖所有清晰可辨认的不同食材，不要因为已识别了西兰花就停止。
- 一种食材只列一项；相同食材出现在多个位置时合并，勿重复。
- name 仅填写一种食材的简短中文名称，例如“西兰花”“包菜”“白萝卜”“小白菜”。不要写解释、括号、英文或多项并列名称。
- 能明确辨认具体品种才写具体名称；只能确定大类时可写“绿叶蔬菜”“肉类”等简短通用名，留给用户核对。不要猜具体品种。
- 遮挡、袋装、模糊或容器里的东西，如无法可靠判断是什么，就不要编造内容。
- 不要把冰箱、碗、锅、包装袋、餐具等非食材物体列入结果。也不要把“熟食/炖菜”推测为某一种肉。
- 数量只能大致估计；无法判断则 quantity 使用空字符串。不要捏造克数。
- 不要为凑数而猜测，不要漏掉画面中明显可辨认的食材。

只输出有效 JSON，不要 Markdown、前言或其他说明。严格使用以下格式：
{"ingredients":[{"name":"食材名称","quantity":"估计数量或空字符串"}]}
如果无法辨认任何食材，输出 {"ingredients":[]}。`;

  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image } },
            { type: "text", text: recognitionPrompt },
          ],
        }],
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(502).json({
        error: data?.error?.message || "模型接口调用失败"
      });
    }

    let text = data?.choices?.[0]?.message?.content || "";
    text = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: "模型返回的不是有效 JSON",
        raw: text
      });
    }

    return res.status(200).json({
      items: (Array.isArray(parsed.ingredients)
        ? parsed.ingredients : [])
        .filter(x => x && typeof x.name === "string" && x.name.trim())
        .map(x => ({
          name: x.name.trim(),
          confidence: "medium"
        }))
    });

  } catch (e) {
    return res.status(500).json({
      error: String(e.message || e)
    });
  }
}
