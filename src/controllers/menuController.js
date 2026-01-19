const cloudinary = require('../config/cloudinary');
const Menu = require('../models/Menu');
const Vendor = require('../models/Vendor');
const { notifyUsersWhoFavoritedVendor } = require("../services/notificationService");

exports.uploadMenu = async (req, res, next) => {
    try {
        const vendorId = req.user.id;
        const { name, category, description, servings, image_url } = req.body;
        const servingsArray = Array.isArray(servings) ? servings : [];

        const menu = await Menu.create({
            vendor_id: vendorId,
            image_url,
            name,
            category,
            description,
            servings: servingsArray
        });

        Vendor.findById(vendorId)
            .select("name profile_image")
            .lean()
            .then((vendor) => {
                const vendorName = vendor?.name || "A vendor";
                const title = `New item from ${vendorName}`;
                const body = `${menu.name} was added`;
                const image = menu.image_url || vendor?.profile_image || null;
                return notifyUsersWhoFavoritedVendor(vendorId, {
                    title,
                    body,
                    image,
                    data: { menuId: menu._id.toString(), event: "new_menu" },
                });
            })
            .catch((err) => {
                console.error("Favorite vendor notify failed:", err);
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
        const { name, category, description, servings, image_url } = req.body;

        const menu = await Menu.findById(id);

        if (!menu) {
            return res.status(404).json({
                success: false,
                code: "MENU_NOT_FOUND",
                message: "No menu item exists with the provided ID"
            });
        }

        if (String(menu.vendor_id) !== String(vendorId)) {
            return res.status(403).json({
                success: false,
                code: "UNAUTHORIZED_MENU_ACCESS",
                message: "This menu item does not belong to the authenticated vendor"
            });
        }

        if (name !== undefined) menu.name = name;
        if (category !== undefined) menu.category = category;
        if (description !== undefined) menu.description = description;
        if (servings !== undefined) menu.servings = Array.isArray(servings) ? servings : menu.servings;
        if (image_url !== undefined) menu.image_url = image_url;

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

exports.getMenusByVendor = async (req, res) => {
    try {
        const { vendor_id } = req.params;

        // Fetch vendor basic info
        const vendor = await Vendor.findById(vendor_id).select(
            "name profile_image vendor_type shop_address"
        );

        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }

        // Fetch vendor menus
        const menus = await Menu.find({ vendor_id })
            .select("name images price category description serving")
            .sort({ created_at: -1 });

        return res.json({
            vendor: {
                vendor_id: vendor._id,
                name: vendor.name,
                vendor_type: vendor.vendor_type,
                profile_image: vendor.profile_image,
                shop_address: vendor.shop_address
            },
            totalMenus: menus.length,
            menus
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
};

exports.deleteMenu = async (req, res, next) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params; // menu id

        // Find the menu belonging to this vendor
        const menu = await Menu.findOne({ _id: id, vendor_id: vendorId });

        if (!menu) {
            return res.status(404).json({
                success: false,
                message: "Menu not found or unauthorized access"
            });
        }

        // Delete from database
        await Menu.deleteOne({ _id: id });

        return res.json({
            success: true,
            message: "Menu deleted successfully"
        });
    } catch (err) {
        console.error("Delete Menu Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};
