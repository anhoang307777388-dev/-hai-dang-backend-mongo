require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const { connectDB } = require('./src/db');
const User = require('./src/models/User');

const authRoutes = require('./src/routes/auth');
const familyRoutes = require('./src/routes/family');
const requestsRoutes = require('./src/routes/requests');
const adminRoutes = require('./src/routes/admin');
const supplyProposalsRoutes = require('./src/routes/supplyProposals');
const supportRequestsRoutes = require('./src/routes/supportRequests');
const sosRoutes = require('./src/routes/sos');
const medicalKpiRoutes = require('./src/routes/medicalKpi');
const chatRoutes = require('./src/routes/chat');

async function seedAdminIfMissing() {
  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) return;

  const email = (process.env.ADMIN_EMAIL || 'admin@haidang.vn').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || 'ThayDoiMatKhauNay123';
  const name = process.env.ADMIN_NAME || 'Quản trị viên hệ thống';

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({ name, email, passwordHash, role: 'admin', status: 'active' });
  console.log('✅ Đã tạo tài khoản quản trị viên mặc định:');
  console.log('   Email:    ' + email);
  console.log('   Mật khẩu: ' + password);
  console.log('   ⚠️  Hãy đăng nhập và đổi mật khẩu này ngay (hoặc đặt lại ADMIN_PASSWORD trước lần deploy đầu).');
}

async function main() {
  await connectDB();
  await seedAdminIfMissing();

  const app = express();

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/family', familyRoutes);
  app.use('/api/requests', requestsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/supply-proposals', supplyProposalsRoutes);
  app.use('/api/support-requests', supportRequestsRoutes);
  app.use('/api/sos', sosRoutes);
  app.use('/api/medical', medicalKpiRoutes);
  app.use('/api/chat', chatRoutes);

  // 404 mặc định cho các route không tồn tại
  app.use((req, res) => res.status(404).json({ error: 'Không tìm thấy đường dẫn API này.' }));

  // Bắt lỗi chưa xử lý để không làm sập cả server
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Đã xảy ra lỗi phía máy chủ.' });
  });

  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`🚀 Server đang chạy ở cổng ${port}`));
}

main().catch((err) => {
  console.error('❌ Không khởi động được server:', err);
  process.exit(1);
});
