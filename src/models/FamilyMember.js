const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    date: String,
    place: String,
    note: String,
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    staffName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const medSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: String,
    schedule: String,
    enteredBy: { type: String, default: '' },
  },
  { _id: false }
);

const vitalSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    bp: String,
    hr: String,
    sugar: String,
    date: { type: Date, default: Date.now },
    enteredBy: { type: String, default: '' },
  },
  { _id: false }
);

const behaviorAssessmentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },
    groupScores: { type: mongoose.Schema.Types.Mixed, default: {} },
    totalScore: Number,
    level: String,
    date: { type: Date, default: Date.now },
  },
  { _id: false }
);

const familyMemberSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    relationship: { type: String, default: '' },
    dob: { type: String, default: '' },
    gender: { type: String, default: 'Nam' },
    history: { type: String, default: '' },
    qrCode: { type: String, unique: true, index: true },
    exams: { type: [examSchema], default: [] },
    meds: { type: [medSchema], default: [] },
    vitals: { type: [vitalSchema], default: [] },
    behaviorAssessments: { type: [behaviorAssessmentSchema], default: [] },
  },
  { timestamps: true }
);

familyMemberSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    relationship: this.relationship,
    dob: this.dob,
    gender: this.gender,
    history: this.history,
    qrCode: this.qrCode,
    exams: this.exams,
    meds: this.meds,
    vitals: this.vitals,
    behaviorAssessments: this.behaviorAssessments,
  };
};

module.exports = mongoose.model('FamilyMember', familyMemberSchema);
