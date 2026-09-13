const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Xác thực bắt buộc: đọc Bearer token, giải mã, nạp user thật từ DB vào req.user.
// Luôn đọc lại từ DB (không chỉ tin vào payload token) để nắm đúng role/status mới nhất
// — ví dụ nếu admin vừa khóa tài khoản, token cũ sẽ bị từ chối ngay ở đây.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại.' });
    if (user.status === 'blocked') return res.status(403).json({ error: 'Tài khoản đã bị khóa.' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Tài khoản đang chờ duyệt.' });

    req.user = user; // Mongoose document đầy đủ, dùng req.user._id khi cần ObjectId thật
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

// Giới hạn theo vai trò, dùng sau requireAuth: requireRole('admin','director')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
