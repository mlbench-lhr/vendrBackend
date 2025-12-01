const cloudinary = require('../config/cloudinary');
const Menu = require('../models/Menu');

exports.uploadMenu = async (req, res, next) => {
    try {
        const vendorId = req.user.id;
        const { name, category, description, serving, price } = req.body;

        let images = [];

        if (req.files && req.files.length > 0) {
            const uploaded = await Promise.all(
                req.files.map(file => {
                    return new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            { folder: "vendors/menu" },
                            (err, result) => err ? reject(err) : resolve(result)
                        );
                        stream.end(file.buffer);
                    });
                })
            );

            images = uploaded.map(img => ({
                url: img.secure_url,
                public_id: img.public_id
            }));
        }

        const menu = await Menu.create({
            vendor_id: vendorId,
            images,
            name,
            category,
            description,
            serving,
            price
        });

        return res.json({ success: true, message: "Menu uploaded successfully", menu });
    } catch (err) {
        console.error("Upload Menu Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

exports.editMenu = async (req, res, next) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;
        const { name, description, serving, price } = req.body;

        const menu = await Menu.findOne({ _id: id, vendor_id: vendorId });
        if (!menu) return res.status(404).json({ error: "Menu item not found" });

        let newImages = menu.images;

        if (req.files && req.files.length > 0) {
            await Promise.all(
                menu.images.map(img =>
                    cloudinary.uploader.destroy(img.public_id)
                )
            );

            const uploaded = await Promise.all(
                req.files.map(file => {
                    return new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            { folder: "vendors/menu" },
                            (err, result) => err ? reject(err) : resolve(result)
                        );
                        stream.end(file.buffer);
                    });
                })
            );

            newImages = uploaded.map(img => ({
                url: img.secure_url,
                public_id: img.public_id
            }));
        }

        menu.name = name;
        menu.description = description;
        menu.serving = serving;
        menu.price = price;
        menu.images = newImages;

        await menu.save();

        return res.json({ success: true, message: "Menu Edited successfully", menu });
    } catch (err) {
        console.error("Edit Menu Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

exports.listMenus = async (req, res, next) => {
    try {
        const vendorId = req.user.id;
        const menus = await Menu.find({ vendor_id: vendorId }).sort({ created_at: -1 });
        return res.json({ success: true, menus });
    } catch (err) {
        console.error("List Fetching Menu Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

