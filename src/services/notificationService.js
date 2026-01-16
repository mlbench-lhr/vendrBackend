const Notification = require("../models/Notification");
const User = require("../models/User");
const VendorLocation = require("../models/VendorLocation");
const { sendAlert } = require("./fcmService");
const logger = require("../utils/logger");

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveVendorCoords(vendorId, vendorLat, vendorLng) {
  if (vendorLat != null && vendorLng != null) return { lat: vendorLat, lng: vendorLng };
  const loc = await VendorLocation.findOne({ vendor_id: vendorId }).lean();
  const fixed = loc?.fixed_location;
  if (fixed && fixed.lat != null && fixed.lng != null) {
    return { lat: fixed.lat, lng: fixed.lng };
  }
  return { lat: null, lng: null };
}

async function notifyUsersNearVendor(vendor, radiusKm = 5) {
  const coords = await resolveVendorCoords(vendor._id, vendor.lat, vendor.lng);
  if (coords.lat == null || coords.lng == null) return;

  const users = await User.find({
    lat: { $ne: null },
    lng: { $ne: null },
    new_vendor_alert: true,
  }).select("fcmDeviceTokens lat lng").lean();

  const title = "New vendor near you";
  const name = vendor.name || "A vendor";
  const body = `${name} is within ${radiusKm} km of you`;

  const tasks = [];
  console.log("users.length-------", users.length);

  for (const u of users) {
    const distance = calculateDistanceKm(u.lat, u.lng, coords.lat, coords.lng);
    if (distance <= radiusKm) {
      const tokens = (u.fcmDeviceTokens || []).filter(Boolean);
      if (tokens.length) {
        tasks.push(Notification.create({
          user_id: u._id,
          vendor_id: vendor._id,
          title,
          body,
        }));
        for (const t of tokens) {
          tasks.push(sendAlert(t, title, body, { vendorId: vendor._id.toString() }));
        }
      }
    }
  }

  if (tasks.length) {
    await Promise.all(tasks);
    logger.info("Nearby vendor notifications sent", { vendorId: vendor._id, tasks: tasks.length });
  }
}

module.exports = { notifyUsersNearVendor };
