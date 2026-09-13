const express = require('express');
const SupportRequest = require('../models/SupportRequest');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('director', 'admin'), async (req, res) => {
  const list = await SupportRequest.find().sort({ createdAt: -1 }).limit(300);
  res.json({ requests: list.map((r) => r.toClientJSON()) });
});

router.post('/', requireAuth, requireRole('director'), async (req, res) => {
  const { target, priority, title, content } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Vui lòng nhập tiêu đề yêu cầu.' });
  if (!['dat_lien', 'chinh_quyen'].includes(target)) return res.status(400).json({ error: 'Nơi gửi không hợp lệ.' });
  const r = await SupportRequest.create({
    directorId: req.user._id,
    directorName: req.user.name,
    target,
    priority: priority === 'khan' ? 'khan' : 'binh_thuong',
    title,
    content: content || '',
  });
  res.json({ request: r.toClientJSON() });
});

router.patch('/:id', requireAuth, requireRole('director'), async (req, res) => {
  const r = await SupportRequest.findById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
  const { status } = req.body || {};
  if (!['cho_duyet', 'dang_xu_ly', 'da_xu_ly'].includes(status)) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  }
  r.status = status;
  await r.save();
  res.json({ request: r.toClientJSON() });
});

module.exports = router;
