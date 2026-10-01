const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Proxy gọi Claude (Anthropic Messages API) — key được giữ bí mật ở server, không lộ ra frontend.
// Cần đặt biến môi trường ANTHROPIC_API_KEY. Nếu chưa có, trả lỗi rõ ràng thay vì crash server.
router.post('/', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Trợ lý AI chưa được cấu hình (thiếu ANTHROPIC_API_KEY trên server).' });
  }
  const { system, messages } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'Thiếu nội dung hội thoại.' });

  // Anthropic cũng yêu cầu các lượt phải LUÂN PHIÊN user/assistant — không được 2 lượt cùng vai trò
  // liền nhau. Hội thoại càng dài càng dễ bị lệch (ví dụ do người dùng kéo-thả sắp xếp lại tin nhắn),
  // nên ở đây ta tự gộp các lượt liền kề cùng vai trò lại làm 1 trước khi gửi đi.
  const normalized = [];
  messages.forEach(m => {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role) {
      prev.content += '\n' + m.content;
    } else {
      normalized.push({ role, content: m.content });
    }
  });
  // Lượt đầu tiên gửi lên phải là "user".
  while (normalized.length && normalized[0].role !== 'user') {
    normalized.shift();
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function callClaude() {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: system || undefined,
        messages: normalized,
      }),
    });
    const data = await upstream.json();
    return { ok: upstream.ok, status: upstream.status, data };
  }
  function isOverloaded(result) {
    const type = result.data?.error?.type || '';
    return result.status === 529 || result.status === 503 || result.status === 429 || type === 'overloaded_error';
  }

  try {
    // Claude thỉnh thoảng báo quá tải (lỗi tạm thời phía Anthropic) — tự thử lại 1 lần trước khi
    // báo lỗi cho người dùng, thay vì bắt họ tự bấm gửi lại ngay.
    let result = await callClaude();
    if (!result.ok && isOverloaded(result)) {
      await sleep(800);
      result = await callClaude();
    }
    if (!result.ok) {
      console.error('Lỗi từ Anthropic API:', result.data);
      const friendly = isOverloaded(result)
        ? 'Trợ lý AI đang bị quá tải tạm thời, vui lòng thử gửi lại sau ít phút.'
        : (result.data.error?.message || 'Trợ lý AI đang gặp sự cố, vui lòng thử lại.');
      return res.status(502).json({ error: friendly });
    }
    res.json(result.data); // đã có sẵn dạng { content: [{ type:'text', text:'...' }] } khớp với frontend
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Không kết nối được tới dịch vụ AI, vui lòng thử lại.' });
  }
});

module.exports = router;
