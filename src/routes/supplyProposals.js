const express = require('express');
const SupplyProposal = require('../models/SupplyProposal');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Nhân viên y tế tạo yêu cầu cấp thuốc/vật tư, gửi lên Giám đốc cơ sở y tế duyệt
router.post('/', requireAuth, requireRole('medical'), async (req, res) => {
  const { item, quantity, reason } = req.body || {};
  if (!item) return res.status(400).json({ error: 'Vui lòng nhập tên thuốc/vật tư.' });
  const p = await SupplyProposal.create({
    staffId: req.user._id,
    staffName: req.user.name,
    item,
    quantity: quantity || '',
    reason: reason || '',
  });
  res.json({ proposal: p.toClientJSON() });
});

// medical: xem để tự lọc "của mình"; director: duyệt/từ chối; admin: chỉ xem để theo dõi
router.get('/', requireAuth, requireRole('medical', 'director', 'admin'), async (req, res) => {
  const list = await SupplyProposal.find().sort({ createdAt: -1 }).limit(500);
  res.json({ proposals: list.map((p) => p.toClientJSON()) });
});

// Chỉ Giám đốc cơ sở y tế được duyệt/từ chối
router.patch('/:id', requireAuth, requireRole('director'), async (req, res) => {
  const p = await SupplyProposal.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
  const { status } = req.body || {};
  if (!['cho_duyet', 'da_duyet', 'tu_choi'].includes(status)) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  }
  p.status = status;
  await p.save();
  res.json({ proposal: p.toClientJSON() });
});

module.exports = router;
