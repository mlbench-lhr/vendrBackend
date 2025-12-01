const mongoose = require('mongoose');

const MenuSchema = new mongoose.Schema({
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    images: [
        {
            url: String,
            public_id: String
        }
    ],
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    serving: { type: String, required: true },
    price: { type: Number, required: true },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Menu', MenuSchema);
