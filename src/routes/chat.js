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

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: system || undefined,
        messages,
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('Lỗi từ Anthropic API:', data);
      return res.status(502).json({ error: data.error?.message || 'Trợ lý AI đang gặp sự cố, vui lòng thử lại.' });
    }
    res.json(data); // đã có sẵn dạng { content: [{ type:'text', text:'...' }] } khớp với frontend
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Không kết nối được tới dịch vụ AI, vui lòng thử lại.' });
  }
});

module.exports = router;
