const mongoose = require('mongoose');

const VendorLocationSchema = new mongoose.Schema({
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },

  mode: {
    type: String,
    enum: ['fixed', 'remote'],
    required: true
  },

  fixed_location: {
    address: { type: String },
    lat: { type: Number },
    lng: { type: Number }
  },

  remote_locations: [
    {
      address: { type: String },
      lat: { type: Number },
      lng: { type: Number }
    }
  ],

  updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VendorLocation', VendorLocationSchema);
