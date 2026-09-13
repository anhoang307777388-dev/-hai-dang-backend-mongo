const mongoose = require('mongoose');

const supportRequestSchema = new mongoose.Schema(
  {
    directorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    directorName: { type: String, required: true },
    target: { type: String, enum: ['dat_lien', 'chinh_quyen'], required: true },
    priority: { type: String, enum: ['binh_thuong', 'khan'], default: 'binh_thuong' },
    title: { type: String, required: true },
    content: { type: String, default: '' },
    status: { type: String, enum: ['cho_duyet', 'dang_xu_ly', 'da_xu_ly'], default: 'cho_duyet' },
  },
  { timestamps: true }
);

supportRequestSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    directorName: this.directorName,
    target: this.target,
    priority: this.priority,
    title: this.title,
    content: this.content,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('SupportRequest', supportRequestSchema);
