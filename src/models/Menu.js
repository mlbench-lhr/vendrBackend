const mongoose = require('mongoose');

const MenuSchema = new mongoose.Schema({
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    image_url: { type: String, required: false },
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    servings: [
        {
            serving: { type: String, required: true },  // e.g., "Single Serving"
            price: { type: String, required: true }     // e.g., 10
        }
    ],
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Menu', MenuSchema);
