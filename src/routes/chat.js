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
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Thiếu nội dung hội thoại.' });
  }
  // Lọc bỏ các tin nhắn rỗng/không hợp lệ ngay từ đầu — tránh gửi rác lên Gemini gây lỗi 400.
  const cleanMessages = messages.filter(m => m && typeof m.content === 'string' && m.content.trim().length > 0);
  if (!cleanMessages.length) {
    return res.status(400).json({ error: 'Nội dung tin nhắn trống.' });
  }

  // Gemini không có tham số "system" riêng như Anthropic — cách phổ biến và ổn định nhất là
  // gộp system prompt vào làm tin nhắn "user" đầu tiên, kèm chỉ dẫn ngắn để mô hình hiểu đó là vai trò của nó.
  const contents = [];
  if (system) {
    contents.push({ role: 'user', parts: [{ text: `[Hướng dẫn hệ thống — hãy tuân theo khi trả lời]\n${system}` }] });
    contents.push({ role: 'model', parts: [{ text: 'Đã hiểu, tôi sẽ tuân theo hướng dẫn trên.' }] });
  }
  cleanMessages.forEach(m => {
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
  // Lượt đầu tiên gửi lên phải là "user".
  while (normalizedContents.length && normalizedContents[0].role !== 'user') {
    normalizedContents.shift();
  }
  if (!normalizedContents.length) {
    return res.status(400).json({ error: 'Không có nội dung hợp lệ để gửi.' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Giới hạn độ dài câu trả lời để Gemini phản hồi nhanh hơn (prompt đã yêu cầu trả lời ngắn gọn,
  // nên 500 token là đủ dư — hạn chế Gemini "lan man" vừa chậm vừa tốn phí).
  const generationConfig = { maxOutputTokens: 500, temperature: 0.7 };

  // Đặt giới hạn thời gian chờ cho mỗi lần gọi — tránh app bị treo vô thời hạn nếu Gemini phản hồi
  // quá chậm hoặc không phản hồi; người dùng sẽ nhận được lỗi rõ ràng để thử lại thay vì chờ mãi.
  async function callGemini(useModel, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ contents: normalizedContents, generationConfig }),
          signal: controller.signal,
        }
      );
      let data = {};
      try { data = await upstream.json(); }
      catch { /* phản hồi không phải JSON hợp lệ — coi như lỗi, data giữ nguyên {} */ }
      return { ok: upstream.ok, status: upstream.status, data, timedOut: false };
    } catch (err) {
      return { ok: false, status: 0, data: {}, timedOut: err.name === 'AbortError' };
    } finally {
      clearTimeout(timer);
    }
  }

  function isOverloaded(result) {
    if (result.timedOut) return true;
    const msg = result.data?.error?.message || '';
    return result.status === 503 || result.status === 429 || /overload|high demand|unavailable/i.test(msg);
  }

  try {
    // Mô hình đang dùng đôi khi bị Google báo "quá tải" (lỗi tạm thời phía họ, không phải lỗi code
    // của mình) — nên ở đây tự thử lại 1 lần trước khi báo lỗi cho người dùng, và nếu vẫn không
    // được thì thử sang 1 model dự phòng khác, thay vì bắt người dùng tự bấm gửi lại.
    let result = await callGemini(model);
    if (!result.ok && isOverloaded(result)) {
      await sleep(500);
      result = await callGemini(model);
    }
    if (!result.ok && isOverloaded(result) && fallbackModel !== model) {
      result = await callGemini(fallbackModel);
    }
    if (!result.ok) {
      console.error('Lỗi từ Gemini API:', result.status, result.data);
      const friendly = isOverloaded(result)
        ? 'Trợ lý AI đang bị quá tải tạm thời, vui lòng thử gửi lại sau ít phút.'
        : (result.data.error?.message || 'Trợ lý AI đang gặp sự cố, vui lòng thử lại.');
      return res.status(502).json({ error: friendly });
    }

    const candidate = result.data.candidates?.[0];
    // Gemini có thể chặn nội dung vì lý do an toàn (finishReason: SAFETY) — báo rõ thay vì trả về rỗng.
    if (candidate?.finishReason === 'SAFETY') {
      return res.status(200).json({ content: [{ type: 'text', text: 'Xin lỗi, mình không thể trả lời câu hỏi này. Nếu đây là tình huống khẩn cấp, vui lòng dùng nút "Trường hợp khẩn cấp".' }] });
    }
    const text = candidate?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) {
      return res.status(502).json({ error: 'Trợ lý AI không trả về nội dung, vui lòng thử lại.' });
    }
    // Chuyển về đúng hình dạng mà frontend đang mong đợi (giống định dạng của Anthropic)
    res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Không kết nối được tới dịch vụ AI, vui lòng thử lại.' });
  }
});

module.exports = router;
