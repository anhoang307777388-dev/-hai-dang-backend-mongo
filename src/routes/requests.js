const express = require('express');
const RequestModel = require('../models/Request');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, requireRole('citizen'), async (req, res) => {
  const { type, note } = req.body || {};
  if (!type) return res.status(400).json({ error: 'Vui lòng chọn loại yêu cầu.' });
  const r = await RequestModel.create({
    citizenId: req.user._id,
    citizenName: req.user.name,
    type,
    note: note || '',
  });
  res.json({ request: r.toClientJSON() });
});

// Nhân viên y tế / admin / giám đốc xem toàn bộ yêu cầu để xử lý và tính KPI
router.get('/', requireAuth, requireRole('medical', 'admin', 'director'), async (req, res) => {
  const list = await RequestModel.find().sort({ createdAt: -1 }).limit(500);
  res.json({ requests: list.map((r) => r.toClientJSON()) });
});

router.patch('/:id', requireAuth, requireRole('medical', 'admin', 'director'), async (req, res) => {
  const r = await RequestModel.findById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
  const { response, status } = req.body || {};
  if (response !== undefined) r.response = response;
  if (status !== undefined) r.status = status;
  r.staffId = req.user._id;
  r.staffName = req.user.name;
  await r.save();
  res.json({ request: r.toClientJSON() });
});

module.exports = router;
