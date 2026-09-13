const express = require('express');
const SosAlert = require('../models/SosAlert');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Người dân gửi SOS. Nếu đang có báo động chưa đóng ca (active/confirmed) của chính họ,
// trả về báo động đó luôn thay vì tạo trùng — tránh spam nhiều báo động cùng lúc.
router.post('/', requireAuth, requireRole('citizen'), async (req, res) => {
  const { lat, lng, phone, note } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Không xác định được vị trí GPS.' });
  }
  const existing = await SosAlert.findOne({ citizenId: req.user._id, status: { $ne: 'resolved' } });
  if (existing) return res.json({ alert: existing.toClientJSON() });

  const alert = await SosAlert.create({
    citizenId: req.user._id,
    name: req.user.name,
    phone: phone || '',
    note: note || '',
    lat,
    lng,
  });
  res.json({ alert: alert.toClientJSON() });
});

router.patch('/:id/location', requireAuth, requireRole('citizen'), async (req, res) => {
  const alert = await SosAlert.findById(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Không tìm thấy báo động.' });
  if (alert.citizenId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Không có quyền với báo động này.' });
  }
  const { lat, lng } = req.body || {};
  if (typeof lat === 'number') alert.lat = lat;
  if (typeof lng === 'number') alert.lng = lng;
  await alert.save();
  res.json({ ok: true });
});

router.get('/mine', requireAuth, requireRole('citizen'), async (req, res) => {
  const alert = await SosAlert.findOne({ citizenId: req.user._id, status: { $ne: 'resolved' } });
  res.json({ alert: alert ? alert.toClientJSON() : null });
});

router.patch('/:id/resolve', requireAuth, requireRole('citizen'), async (req, res) => {
  const alert = await SosAlert.findById(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Không tìm thấy báo động.' });
  if (alert.citizenId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Không có quyền với báo động này.' });
  }
  alert.status = 'resolved';
  await alert.save();
  res.json({ ok: true });
});

// Nhân viên y tế / admin / giám đốc xem danh sách để xử lý — giới hạn báo động đã đóng ca
// trong 24h gần nhất để tránh phình dữ liệu trả về theo thời gian.
router.get('/', requireAuth, requireRole('medical', 'admin', 'director'), async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alerts = await SosAlert.find({
    $or: [{ status: { $ne: 'resolved' } }, { updatedAt: { $gte: since } }],
  }).sort({ createdAt: -1 });
  res.json({ alerts: alerts.map((a) => a.toClientJSON()) });
});

router.patch('/:id/status', requireAuth, requireRole('medical', 'admin', 'director'), async (req, res) => {
  const alert = await SosAlert.findById(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Không tìm thấy báo động.' });
  const { status } = req.body || {};
  if (!['active', 'confirmed', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  }
  alert.status = status;
  if (status === 'confirmed') alert.confirmedBy = req.user.name;
  await alert.save();
  res.json({ alert: alert.toClientJSON() });
});

module.exports = router;
