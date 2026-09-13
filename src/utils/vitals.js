// Cùng ngưỡng cảnh báo với phần client (checkVitalAlertsClient trong index.html)
// để nhận định của server luôn khớp với những gì người dùng thấy trên giao diện.
function computeVitalAlerts(v) {
  const alerts = [];
  if (v.bp) {
    const mm = String(v.bp).match(/(\d+)\s*\/\s*(\d+)/);
    if (mm) {
      const sys = parseInt(mm[1], 10);
      const dia = parseInt(mm[2], 10);
      if (sys >= 140 || dia >= 90) alerts.push({ level: 'cao', message: `Huyết áp cao (${v.bp} mmHg)` });
      else if (sys > 0 && sys < 90) alerts.push({ level: 'canh_bao', message: `Huyết áp thấp (${v.bp} mmHg)` });
    }
  }
  if (v.hr) {
    const hr = Number(v.hr);
    if (hr > 100) alerts.push({ level: 'canh_bao', message: `Nhịp tim nhanh (${hr} bpm)` });
    else if (hr > 0 && hr < 60) alerts.push({ level: 'canh_bao', message: `Nhịp tim chậm (${hr} bpm)` });
  }
  if (v.sugar) {
    const s = Number(v.sugar);
    if (s >= 126) alerts.push({ level: 'cao', message: `Đường huyết cao (${s} mg/dL)` });
    else if (s > 0 && s < 70) alerts.push({ level: 'cao', message: `Đường huyết thấp (${s} mg/dL)` });
  }
  return alerts;
}

module.exports = { computeVitalAlerts };
