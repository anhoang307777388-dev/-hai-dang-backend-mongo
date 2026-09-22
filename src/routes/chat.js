const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Proxy gọi Google Gemini API — key được giữ bí mật ở server, không lộ ra frontend.
// Cần đặt biến môi trường GEMINI_API_KEY. Nếu chưa có, trả lỗi rõ ràng thay vì crash server.
//
// Frontend được viết theo định dạng phản hồi của Anthropic: { content: [{ type:'text', text:'...' }] }
// Vì vậy ở đây ta: (1) chuyển đổi { system, messages } sang định dạng Gemini,
// (2) gọi Gemini, rồi (3) "dịch" ngược kết quả về đúng hình dạng { content: [...] } cho frontend dùng
// mà không cần sửa gì bên giao diện.
router.post('/', requireAuth, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Trợ lý AI chưa được cấu hình (thiếu GEMINI_API_KEY trên server).' });
  }
  const { system, messages } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'Thiếu nội dung hội thoại.' });

  // Gemini không có tham số "system" riêng như Anthropic — Cách phổ biến và ổn định nhất là
  // gộp system prompt vào làm tin nhắn "user" đầu tiên, kèm chỉ dẫn ngắn để mô hình hiểu đó là vai trò của nó.
  const contents = [];
  if (system) {
    contents.push({ role: 'user', parts: [{ text: `[Hướng dẫn hệ thống — hãy tuân theo khi trả lời]\n${system}` }] });
    contents.push({ role: 'model', parts: [{ text: 'Đã hiểu, tôi sẽ tuân theo hướng dẫn trên.' }] });
  }
  messages.forEach(m => {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  });

  // Gemini bắt buộc các lượt phải LUÂN PHIÊN user/model — không được 2 lượt cùng vai trò liền nhau.
  // Hội thoại càng dài càng dễ bị lệch (ví dụ do người dùng kéo-thả sắp xếp lại tin nhắn, hoặc gửi
  // liên tiếp trước khi có phản hồi), nên ở đây ta tự gộp các lượt liền kề cùng vai trò lại làm 1,
  // đảm bảo luôn đúng thứ tự trước khi gửi đi — tránh Gemini trả lỗi 400 giữa chừng cuộc trò chuyện.
  const normalizedContents = [];
  contents.forEach(c => {
    const prev = normalizedContents[normalizedContents.length - 1];
    if (prev && prev.role === c.role) {
      prev.parts[0].text += '\n' + c.parts[0].text;
    } else {
      normalizedContents.push({ role: c.role, parts: [{ text: c.parts[0].text }] });
    }
  });
  // Gemini cũng yêu cầu lượt đầu tiên phải là "user" — phòng trường hợp lịch sử trống hoặc bắt đầu bằng "model".
  while (normalizedContents.length && normalizedContents[0].role !== 'user') {
    normalizedContents.shift();
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function callGemini(useModel) {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: normalizedContents }),
      }
    );
    const data = await upstream.json();
    return { ok: upstream.ok, status: upstream.status, data };
  }
  function isOverloaded(result) {
    const msg = result.data?.error?.message || '';
    return result.status === 503 || result.status === 429 || /overload|high demand|unavailable/i.test(msg);
  }

  try {
    // Mô hình đang dùng đôi khi bị Google báo "quá tải" (lỗi tạm thời phía họ, không phải lỗi code
    // của mình) — nên ở đây tự thử lại vài lần trước khi báo lỗi cho người dùng, và nếu vẫn không
    // được thì thử sang 1 model dự phòng khác, thay vì bắt người dùng tự bấm gửi lại.
    let result = await callGemini(model);
    if (!result.ok && isOverloaded(result)) {
      await sleep(700);
      result = await callGemini(model);
    }
    if (!result.ok && isOverloaded(result) && fallbackModel !== model) {
      await sleep(300);
      result = await callGemini(fallbackModel);
    }
    if (!result.ok) {
      console.error('Lỗi từ Gemini API:', result.data);
      const friendly = isOverloaded(result)
        ? 'Trợ lý AI đang bị quá tải tạm thời, vui lòng thử gửi lại sau ít phút.'
        : (result.data.error?.message || 'Trợ lý AI đang gặp sự cố, vui lòng thử lại.');
      return res.status(502).json({ error: friendly });
    }
    const text = result.data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    // Chuyển về đúng hình dạng mà frontend đang mong đợi (giống định dạng của Anthropic)
    res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Không kết nối được tới dịch vụ AI, vui lòng thử lại.' });
  }
});

module.exports = router;
