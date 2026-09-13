const express = require('express');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ users: users.map((u) => u.toSafeJSON()) });
});

router.patch('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Không thể chỉnh sửa tài khoản quản trị viên khác qua đây.' });

  const { role, status } = req.body || {};
  if (role !== undefined) {
    if (!['citizen', 'medical', 'director', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
    }
    user.role = role;
  }
  if (status !== undefined) {
    if (!['active', 'pending', 'blocked'].includes(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
    }
    user.status = status;
  }
  await user.save();
  res.json({ user: user.toSafeJSON() });
});

module.exports = router;
