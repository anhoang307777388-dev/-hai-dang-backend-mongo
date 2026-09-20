const express = require('express');
const { v4: uuid } = require('uuid');
const FamilyMember = require('../models/FamilyMember');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeVitalAlerts } = require('../utils/vitals');
const { scoreBehaviorAnswers } = require('../utils/behavior');
const { generateInsight } = require('../utils/aiInsight');

const router = express.Router();

async function loadOwnedMember(req, res) {
  const member = await FamilyMember.findById(req.params.id);
  if (!member) { res.status(404).json({ error: 'Không tìm thấy hồ sơ.' }); return null; }
  if (member.ownerId.toString() !== req.user._id.toString()) {
    res.status(403).json({ error: 'Bạn không có quyền với hồ sơ này.' });
    return null;
  }
  return member;
}

// Vá cho các hồ sơ tạo từ trước khi trường qrCode được lưu bắt buộc — sinh mã và lưu lại ngay khi phát hiện thiếu.
async function ensureQrCode(member) {
  if (!member.qrCode) {
    member.qrCode = uuid();
    await member.save();
  }
  return member;
}

// Danh sách hồ sơ (bản thân + người thân) thuộc về tài khoản đang đăng nhập
router.get('/', requireAuth, requireRole('citizen'), async (req, res) => {
  const members = await FamilyMember.find({ ownerId: req.user._id }).sort({ createdAt: 1 });
  await Promise.all(members.map(ensureQrCode));
  res.json({ members: members.map((m) => m.toClientJSON()) });
});

// Tạo hồ sơ mới (bản thân hoặc người thân)
router.post('/', requireAuth, requireRole('citizen'), async (req, res) => {
  const { name, relationship, dob, gender, history } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Vui lòng nhập họ tên.' });

  const member = await FamilyMember.create({
    ownerId: req.user._id,
    name: String(name).trim(),
    relationship: relationship || '',
    dob: dob || '',
    gender: gender || 'Nam',
    history: history || '',
    qrCode: uuid(),
  });
  res.json({ member: member.toClientJSON() });
});

// Tra cứu hồ sơ theo mã QR — dùng để (a) người dân thêm người thân bằng mã người thân đưa,
// (b) nhân viên y tế quét mã để xem nhanh thông tin bệnh nhân. Không giới hạn theo ownerId
// vì mục đích của mã QR chính là chia sẻ có kiểm soát giữa các vai trò khác nhau.
router.get('/lookup/:code', requireAuth, async (req, res) => {
  const member = await FamilyMember.findOne({ qrCode: req.params.code });
  if (!member) return res.status(404).json({ error: 'Mã QR không hợp lệ hoặc hồ sơ không tồn tại.' });

  const latestVital = member.vitals[member.vitals.length - 1];
  const alerts = latestVital ? computeVitalAlerts(latestVital) : [];

  res.json({ member: { ...member.toClientJSON(), alerts } });
});

// Cập nhật thông tin hồ sơ
router.patch('/:id', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  const { name, dob, gender, relationship, history } = req.body || {};
  if (name !== undefined) member.name = name;
  if (dob !== undefined) member.dob = dob;
  if (gender !== undefined) member.gender = gender;
  if (relationship !== undefined) member.relationship = relationship;
  if (history !== undefined) member.history = history;
  await member.save();
  res.json({ member: member.toClientJSON() });
});

router.delete('/:id', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  await member.deleteOne();
  res.json({ ok: true });
});

// ---- Lịch sử khám ----
router.post('/:id/exams', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  const { date, place, note } = req.body || {};
  if (!place) return res.status(400).json({ error: 'Vui lòng nhập nơi khám.' });
  const exam = { id: uuid(), date: date || '', place, note: note || '' };
  member.exams.push(exam);
  await member.save();
  res.json({ exam });
});

router.delete('/:id/exams/:examId', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  member.exams = member.exams.filter((e) => e.id !== req.params.examId);
  await member.save();
  res.json({ ok: true });
});

// ---- Thuốc đang dùng ----
router.post('/:id/meds', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  const { name, schedule } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên thuốc.' });
  const med = { id: uuid(), name, schedule: schedule || '' };
  member.meds.push(med);
  await member.save();
  res.json({ med });
});

router.delete('/:id/meds/:medId', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  member.meds = member.meds.filter((m) => m.id !== req.params.medId);
  await member.save();
  res.json({ ok: true });
});

// ---- Chỉ số sinh hiệu ----
router.post('/:id/vitals', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  const { bp, hr, sugar } = req.body || {};
  if (!bp && !hr && !sugar) return res.status(400).json({ error: 'Vui lòng nhập ít nhất một chỉ số.' });
  const vital = { id: uuid(), bp: bp || '', hr: hr || '', sugar: sugar || '', date: new Date() };
  member.vitals.push(vital);
  await member.save();
  const alerts = computeVitalAlerts(vital);
  res.json({ vital, alerts });
});

// ---- Đánh giá mức độ chủ động chăm sóc sức khỏe (20 câu) ----
router.post('/:id/behavior-assessment', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  try {
    const { groupScores, totalScore, level } = scoreBehaviorAnswers((req.body || {}).answers || {});
    const assessment = { id: uuid(), answers: req.body.answers, groupScores, totalScore, level, date: new Date() };
    member.behaviorAssessments.push(assessment);
    await member.save();
    res.json({ assessment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Nhận định AI (rule-based, xem src/utils/aiInsight.js) ----
router.post('/:id/ai-insight', requireAuth, requireRole('citizen'), async (req, res) => {
  const member = await loadOwnedMember(req, res);
  if (!member) return;
  const insight = generateInsight(member);
  res.json({ insight });
});

async function loadAnyMember(req, res) {
  const member = await FamilyMember.findById(req.params.id);
  if (!member) { res.status(404).json({ error: 'Không tìm thấy hồ sơ.' }); return null; }
  return member;
}

// ---------------------------------------------------------------------------
// NHÂN VIÊN Y TẾ CẬP NHẬT HỒ SƠ BỆNH NHÂN (sau khi quét mã QR khi khám trực tiếp)
// Khác với các route ở trên (dành cho chủ sở hữu là citizen), nhóm này KHÔNG kiểm tra
// quyền sở hữu — chỉ cần đúng vai trò medical/admin và biết đúng ID (lấy được từ quét QR).
// ---------------------------------------------------------------------------

// Xem lại hồ sơ đầy đủ theo ID — dùng để làm mới màn hình sau khi ghi nhận thêm, không cần quét lại
router.get('/staff/:id', requireAuth, requireRole('medical', 'admin'), async (req, res) => {
  const member = await loadAnyMember(req, res);
  if (!member) return;
  const latestVital = member.vitals[member.vitals.length - 1];
  const alerts = latestVital ? computeVitalAlerts(latestVital) : [];
  res.json({ member: { ...member.toClientJSON(), alerts } });
});

router.post('/staff/:id/exams', requireAuth, requireRole('medical', 'admin'), async (req, res) => {
  const member = await loadAnyMember(req, res);
  if (!member) return;
  const { date, place, note } = req.body || {};
  if (!place) return res.status(400).json({ error: 'Vui lòng nhập nơi khám.' });
  const exam = {
    id: uuid(), date: date || new Date().toISOString().slice(0, 10), place, note: note || '',
    staffId: req.user._id, staffName: req.user.name, createdAt: new Date(),
  };
  member.exams.push(exam);
  await member.save();
  res.json({ exam });
});

router.post('/staff/:id/meds', requireAuth, requireRole('medical', 'admin'), async (req, res) => {
  const member = await loadAnyMember(req, res);
  if (!member) return;
  const { name, schedule } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên thuốc.' });
  const med = { id: uuid(), name, schedule: schedule || '', enteredBy: req.user.name };
  member.meds.push(med);
  await member.save();
  res.json({ med });
});

router.post('/staff/:id/vitals', requireAuth, requireRole('medical', 'admin'), async (req, res) => {
  const member = await loadAnyMember(req, res);
  if (!member) return;
  const { bp, hr, sugar } = req.body || {};
  if (!bp && !hr && !sugar) return res.status(400).json({ error: 'Cần nhập ít nhất một chỉ số.' });
  const vital = { id: uuid(), bp: bp || '', hr: hr || '', sugar: sugar || '', date: new Date(), enteredBy: req.user.name };
  member.vitals.push(vital);
  await member.save();
  const alerts = computeVitalAlerts(vital);
  res.json({ vital, alerts });
});

module.exports = router;
