const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ Thiếu biến môi trường MONGODB_URI. Server sẽ không lưu được dữ liệu bền vững.');
    console.error('   Tạo cluster miễn phí tại https://www.mongodb.com/cloud/atlas rồi dán connection string vào MONGODB_URI.');
    process.exit(1);
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('✅ Đã kết nối MongoDB thành công — dữ liệu sẽ được lưu bền vững.');
}

module.exports = { connectDB };
