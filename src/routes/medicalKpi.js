const express = require('express');
const RequestModel = require('../models/Request');
const SupplyProposal = require('../models/SupplyProposal');
const FamilyMember = require('../models/FamilyMember');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/kpi', requireAuth, requireRole('medical'), async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [handledToday, pending, medicineRequestsToday, patientsSeenAgg] = await Promise.all([
    RequestModel.countDocuments({ staffId: req.user._id, status: 'da_xu_ly', updatedAt: { $gte: startOfToday } }),
    RequestModel.countDocuments({ status: { $ne: 'da_xu_ly' } }),
    SupplyProposal.countDocuments({ staffId: req.user._id, createdAt: { $gte: startOfToday } }),
    // Số bệnh nhân đã khám hôm nay = số lần khám do chính nhân viên này ghi nhận (qua quét QR) trong ngày
    FamilyMember.aggregate([
      { $unwind: '$exams' },
      { $match: { 'exams.staffId': req.user._id, 'exams.createdAt': { $gte: startOfToday } } },
      { $count: 'count' },
    ]),
  ]);
  const patientsSeenToday = patientsSeenAgg[0]?.count || 0;

  res.json({ patientsSeenToday, handledToday, pending, medicineRequestsToday });
});

module.exports = router;
