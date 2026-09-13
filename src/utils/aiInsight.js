const { computeVitalAlerts } = require('./vitals');

// Sinh nhận định dựa trên luật (rule-based) từ dữ liệu hồ sơ sẵn có — không cần gọi API AI trả phí,
// nên luôn chạy được ngay sau khi deploy. Nếu sau này muốn nhận định "thông minh" hơn bằng LLM thật,
// chỉ cần thay nội dung hàm này bằng một lệnh gọi tới API của Anthropic/OpenAI (xem README).
function generateInsight(member) {
  const lines = [];
  const latestVital = member.vitals[member.vitals.length - 1];

  if (latestVital) {
    const alerts = computeVitalAlerts(latestVital);
    if (alerts.length) {
      lines.push('⚠️ Chỉ số sinh hiệu gần nhất có dấu hiệu bất thường:');
      alerts.forEach((a) => lines.push('- ' + a.message));
      lines.push('Nên theo dõi sát và liên hệ nhân viên y tế nếu triệu chứng không cải thiện.');
    } else {
      lines.push('✓ Chỉ số sinh hiệu gần nhất đang trong ngưỡng bình thường.');
    }
  } else {
    lines.push('Chưa có dữ liệu chỉ số sinh hiệu nào được ghi nhận — nên đo và cập nhật định kỳ.');
  }

  if (member.meds && member.meds.length) {
    lines.push(`Hiện đang theo dõi ${member.meds.length} loại thuốc: ${member.meds.map((m) => m.name).join(', ')}. Cần tuân thủ đúng lịch uống.`);
  }

  if (member.behaviorAssessments && member.behaviorAssessments.length) {
    const latest = member.behaviorAssessments[member.behaviorAssessments.length - 1];
    lines.push(`Mức độ chủ động chăm sóc sức khỏe gần nhất: ${latest.totalScore}/100 điểm (${latest.level}).`);
    if (latest.level === 'Thấp' || latest.level === 'Trung bình thấp') {
      lines.push('Nên khuyến khích chủ động theo dõi sức khỏe và tái khám định kỳ hơn.');
    }
  }

  if (member.history) {
    lines.push(`Tiền sử bệnh/dị ứng cần lưu ý: ${member.history}.`);
  }

  if (!member.exams || !member.exams.length) {
    lines.push('Chưa có lịch sử khám nào được ghi nhận — nên sắp xếp khám sức khỏe định kỳ.');
  }

  return lines.join('\n');
}

module.exports = { generateInsight };
