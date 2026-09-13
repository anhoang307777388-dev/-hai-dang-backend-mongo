const mongoose = require('mongoose');

const supplyProposalSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    staffName: { type: String, required: true },
    item: { type: String, required: true },
    quantity: { type: String, default: '' },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['cho_duyet', 'da_duyet', 'tu_choi'], default: 'cho_duyet' },
  },
  { timestamps: true }
);

supplyProposalSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    staffId: this.staffId.toString(),
    staffName: this.staffName,
    item: this.item,
    quantity: this.quantity,
    reason: this.reason,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('SupplyProposal', supplyProposalSchema);
