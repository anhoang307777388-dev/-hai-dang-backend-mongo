const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Proxy gọi Google Gemini API — key được giữ bí mật ở server, không lộ ra frontend.
// Cần đặt biến môi trường GEMINI_API_KEY. Nếu chưa có, trả lỗi rõ ràng thay vì crash server.
//
// Frontend được viết theo định dạng phản hồi của Anthropic: { content: [{ type:'text', text:'...' }] }
// Vì vậy ở đây ta: (1) chuyển đổi { system, messages } sang định dạng Gemini,
// (2) gọi Gemini, rồi (3) "dịch" ngược kết quả về đúng hình dạng { content: [...] } cho frontend dùng.
router.post('/', requireAuth, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Trợ lý sức khỏe chưa được cấu hình (thiếu GEMINI_API_KEY trên server).' });
  }
  const { system, messages } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'Thiếu nội dung hội thoại.' });

  // SỬA: Gemini có trường "systemInstruction" riêng cho lời dặn hệ thống. Bản cũ nhét lời dặn vào
  // một tin "user" giả — mô hình dễ coi đó là hội thoại thường và viết cả phần suy nghĩ/đếm từ
  // (tiếng Anh) ra câu trả lời. Dùng đúng trường này thì mô hình tuân theo ổn định hơn.
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }],
  }));

  // Gemini bắt buộc các lượt phải LUÂN PHIÊN user/model — gộp các lượt liền kề cùng vai trò lại làm 1.
  const normalizedContents = [];
  contents.forEach(c => {
    const prev = normalizedContents[normalizedContents.length - 1];
    if (prev && prev.role === c.role) {
      prev.parts[0].text += '\n' + c.parts[0].text;
    } else {
      normalizedContents.push({ role: c.role, parts: [{ text: c.parts[0].text }] });
    }
  });
  // Gemini cũng yêu cầu lượt đầu tiên phải là "user".
  while (normalizedContents.length && normalizedContents[0].role !== 'user') {
    normalizedContents.shift();
  }
  if (!normalizedContents.length) return res.status(400).json({ error: 'Thiếu nội dung hội thoại.' });

  // gemini-2.5-flash đã bị Google ngừng cho người dùng mới — dùng dòng 3.x.
  // GEMINI_FALLBACK_MODEL có thể ghi nhiều model, cách nhau bằng dấu phẩy.
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbackModels = (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash')
    .split(',').map(s => s.trim()).filter(m => m && m !== model);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Gemini 3 mặc định "suy nghĩ" ở mức high trước khi trả lời → rất chậm. Với hỏi đáp sức khỏe thông thường,
  // mức "low" nhanh hơn nhiều mà vẫn đủ tốt. Đổi bằng biến GEMINI_THINKING_LEVEL (minimal/low/medium/high).
  const thinkingLevel = process.env.GEMINI_THINKING_LEVEL || 'low';
  let useThinking = true;

  async function callGemini(useModel) {
    const body = { contents: normalizedContents };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (useThinking) body.generationConfig = { thinkingConfig: { thinkingLevel } };
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      }
    );
    const data = await upstream.json().catch(() => ({}));
    return { ok: upstream.ok, status: upstream.status, data, model: useModel };
  }
  const errMsg = (result) => result.data?.error?.message || '';
  // 429 = hết hạn mức (quota) của API key — gói miễn phí giới hạn số lượt/phút và/ngày cho TỪNG model.
  const isQuota = (result) => result.status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(errMsg(result) + (result.data?.error?.status || ''));
  // 503 = phía Google đang quá tải tạm thời.
  const isOverloaded = (result) => result.status === 503 || /overload|high demand|UNAVAILABLE/.test(errMsg(result) + (result.data?.error?.status || ''));
  // Model đã bị ngừng / không tồn tại (vd. biến môi trường còn ghi model cũ).
  const isRetired = (result) => result.status === 404 || /no longer available|not found|update your code|deprecated/i.test(errMsg(result));

  try {
    let result = await callGemini(model);
    // Nếu model không hỗ trợ thinkingLevel (lỗi 400) thì gửi lại không kèm cấu hình này.
    if (!result.ok && result.status === 400 && /thinking/i.test(errMsg(result))) {
      useThinking = false;
      result = await callGemini(model);
    }
    if (!result.ok && isOverloaded(result)) {
      await sleep(700);
      result = await callGemini(model);
    }
    // Lỗi quá tải / hết hạn mức / model bị ngừng → lần lượt thử các model dự phòng (mỗi model có hạn mức riêng).
    for (const fb of fallbackModels) {
      if (result.ok || !(isOverloaded(result) || isQuota(result) || isRetired(result))) break;
      console.warn(`Gemini model ${result.model} lỗi ${result.status}: ${errMsg(result)} → thử ${fb}`);
      await sleep(300);
      result = await callGemini(fb);
    }
    if (!result.ok) {
      console.error(`Lỗi từ Gemini API (model ${result.model}, HTTP ${result.status}):`, JSON.stringify(result.data));
      let friendly = 'Trợ lý sức khỏe đang gặp sự cố, vui lòng thử lại sau.';
      if (isQuota(result)) friendly = 'Trợ lý sức khỏe đã hết lượt sử dụng trong thời gian này, vui lòng thử lại sau.';
      else if (isOverloaded(result)) friendly = 'Trợ lý sức khỏe đang bị quá tải tạm thời, vui lòng thử gửi lại sau ít phút.';
      return res.status(502).json({ error: friendly });
    }

    const candidate = result.data.candidates?.[0] || {};
    // SỬA: bỏ các phần "suy nghĩ" (thought) của mô hình, chỉ lấy phần trả lời gửi cho người dùng.
    const text = (candidate.content?.parts || [])
      .filter(p => !p.thought && typeof p.text === 'string')
      .map(p => p.text)
      .join('')
      .trim();
    const finish = candidate.finishReason || '';
    if (finish && finish !== 'STOP') console.warn('Gemini dừng sớm, finishReason =', finish);

    // Chuyển về đúng hình dạng mà frontend đang mong đợi (giống định dạng của Anthropic).
    // stop_reason = 'max_tokens' giúp frontend báo cho người dùng biết câu trả lời bị cắt.
    res.json({
      content: [{ type: 'text', text }],
      stop_reason: finish === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Không kết nối được tới dịch vụ AI, vui lòng thử lại.' });
  }
});

module.exports = router;
