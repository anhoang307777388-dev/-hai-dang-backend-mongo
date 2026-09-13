const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu cần tối thiểu 6 ký tự.' });
    }
    // Chỉ cho tự đăng ký 3 vai trò này; tài khoản admin phải được tạo thủ công (xem README) để tránh bị lợi dụng.
    const allowedRoles = ['citizen', 'medical', 'director'];
    const finalRole = allowedRoles.includes(role) ? role : 'citizen';

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'Email này đã được đăng ký.' });

    const passwordHash = await bcrypt.hash(password, 10);
    // Nhân viên y tế / giám đốc CSYT cần admin duyệt trước khi dùng được; người dân dùng được ngay.
    const status = finalRole === 'citizen' ? 'active' : 'pending';

    const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash, role: finalRole, status });

    if (status === 'pending') {
      return res.json({ pending: true, message: 'Đăng ký thành công! Tài khoản của bạn đang chờ quản trị viên duyệt trước khi đăng nhập được.' });
    }
    return res.json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Đã xảy ra lỗi khi đăng ký, vui lòng thử lại.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu.' });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(400).json({ error: 'Email hoặc mật khẩu không đúng.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Email hoặc mật khẩu không đúng.' });

    if (user.status === 'pending') return res.status(403).json({ error: 'Tài khoản đang chờ quản trị viên duyệt.' });
    if (user.status === 'blocked') return res.status(403).json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' });

    return res.json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Đã xảy ra lỗi khi đăng nhập, vui lòng thử lại.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = router;
