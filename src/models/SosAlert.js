const mongoose = require('mongoose');

const sosAlertSchema = new mongoose.Schema(
  {
    citizenId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    note: { type: String, default: '' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    status: { type: String, enum: ['active', 'confirmed', 'resolved'], default: 'active' },
    confirmedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

sosAlertSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    phone: this.phone,
    note: this.note,
    lat: this.lat,
    lng: this.lng,
    status: this.status,
    confirmedBy: this.confirmedBy,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('SosAlert', sosAlertSchema);
