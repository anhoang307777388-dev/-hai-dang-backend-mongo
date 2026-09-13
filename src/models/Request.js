const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema(
  {
    citizenId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    citizenName: { type: String, required: true },
    type: { type: String, required: true },
    note: { type: String, default: '' },
    status: { type: String, enum: ['moi', 'dang_xu_ly', 'da_xu_ly'], default: 'moi' },
    response: { type: String, default: '' },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    staffName: { type: String, default: '' },
  },
  { timestamps: true }
);

requestSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    citizenName: this.citizenName,
    type: this.type,
    note: this.note,
    status: this.status,
    response: this.response,
    staffId: this.staffId ? this.staffId.toString() : null,
    staffName: this.staffName,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Request', requestSchema);
