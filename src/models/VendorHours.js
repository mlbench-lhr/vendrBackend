const mongoose = require('mongoose');

const VendorHoursSchema = new mongoose.Schema({
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  days: {
    monday:   { enabled: Boolean, start: String, end: String },
    tuesday:  { enabled: Boolean, start: String, end: String },
    wednesday:{ enabled: Boolean, start: String, end: String },
    thursday: { enabled: Boolean, start: String, end: String },
    friday:   { enabled: Boolean, start: String, end: String },
    saturday: { enabled: Boolean, start: String, end: String },
    sunday:   { enabled: Boolean, start: String, end: String }
  },
  updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VendorHours', VendorHoursSchema);
