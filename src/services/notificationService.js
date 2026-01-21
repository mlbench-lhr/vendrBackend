const Notification = require("../models/Notification");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const VendorLocation = require("../models/VendorLocation");
const FavoriteVendor = require("../models/FavoriteVendor");
const { sendAlert } = require("./fcmService");
const logger = require("../utils/logger");
const mongoose = require("mongoose");

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
  console.log("[new_vendor_alert] notifyUsersNearVendor:start", {
    vendorId: vendor?._id?.toString?.() || vendor?._id,
    radiusKm,
  });

  const coords = await resolveVendorCoords(vendor._id, vendor.lat, vendor.lng);
  if (coords.lat == null || coords.lng == null) return;
  console.log("[new_vendor_alert] vendorCoords", { vendorId: vendor?._id?.toString?.() || vendor?._id, ...coords });

  const users = await User.find({
    lat: { $ne: null },
    lng: { $ne: null },
    new_vendor_alert: true,
  }).select("fcmDeviceTokens lat lng").lean();
  console.log("[new_vendor_alert] candidateUsers", { count: users.length });

  if (!users.length) {
    logger.info("Nearby vendor notifications: no candidate users", { vendorId: vendor._id.toString() });
    return;
  }

  const title = "New Vendor Nearby";
  const body = "A new vendor registered & available in your vicinity, Explore Now!";
  const type = "new_vendor_nearby";
  const data = { vendorId: vendor._id.toString(), type };
  const createdAt = new Date();

  const tasks = [];
  let inRadiusUsers = 0;
  let persistedNotifications = 0;
  let pushAttempts = 0;

  for (const u of users) {
    const distance = calculateDistanceKm(u.lat, u.lng, coords.lat, coords.lng);
    if (distance > radiusKm) continue;

    inRadiusUsers += 1;
    const tokens = (u.fcmDeviceTokens || []).filter(Boolean);

    console.log("[new_vendor_alert] userInRadius", {
      userId: u._id.toString(),
      vendorId: vendor._id.toString(),
      distanceKm: Number(distance.toFixed(3)),
      tokens: tokens.length,
    });

    tasks.push(Notification.create({ user_id: u._id, vendor_id: vendor._id, title, body, type, data, created_at: createdAt }));
    persistedNotifications += 1;

    for (const t of tokens) {
      pushAttempts += 1;
      tasks.push(sendAlert(t, title, body, data));
    }
  }

  if (!tasks.length) {
    logger.info("Nearby vendor notifications: no users in radius", {
      vendorId: vendor._id.toString(),
      radiusKm,
      candidateUsers: users.length,
    });
    return;
  }

  const results = await Promise.allSettled(tasks);
  const rejected = results.filter((r) => r.status === "rejected");

  logger.info("Nearby vendor notifications: processed", {
    vendorId: vendor._id.toString(),
    radiusKm,
    candidateUsers: users.length,
    inRadiusUsers,
    persistedNotifications,
    pushAttempts,
    tasks: tasks.length,
    failedTasks: rejected.length,
  });

  if (rejected.length) {
    const sample = rejected[0]?.reason;
    logger.error("Nearby vendor notifications: failures detected", sample);
  }
}

function toObjectIdOrNull(value) {
  const str = value == null ? "" : String(value);
  if (!mongoose.Types.ObjectId.isValid(str)) return null;
  return new mongoose.Types.ObjectId(str);
}

async function notifyUsersWhoFavoritedVendor(vendorId, input) {
  const vendorObjectId = toObjectIdOrNull(vendorId);
  if (!vendorObjectId) return;

  const {
    title,
    body,
    image = null,
    data,
  } = input || {};

  if (!title || !body) return;

  const favorites = await FavoriteVendor.find({ vendorId: vendorObjectId.toString() })
    .select("userId")
    .lean();
  if (!favorites.length) return;

  const userObjectIds = favorites
    .map((f) => toObjectIdOrNull(f.userId))
    .filter(Boolean);
  if (!userObjectIds.length) return;

  const users = await User.find({
    _id: { $in: userObjectIds },
    favorite_vendor_alert: true,
  })
    .select("fcmDeviceTokens")
    .lean();
  if (!users.length) return;

  const vendor = await Vendor.findById(vendorObjectId).select("name").lean();
  const vendorName = vendor?.name || undefined;

  const createdAt = new Date();
  const notifications = users.map((u) => ({
    user_id: u._id,
    vendor_id: vendorObjectId,
    type: "favorite_vendor",
    data: { ...(data || {}), vendorId: vendorObjectId.toString(), type: "favorite_vendor" },
    title,
    body,
    image,
    created_at: createdAt,
  }));

  const fcmTasks = [];
  for (const u of users) {
    const tokens = (u.fcmDeviceTokens || []).filter(Boolean);
    for (const t of tokens) {
      fcmTasks.push(sendAlert(t, title, body, { ...(data || {}), vendorId: vendorObjectId.toString(), type: "favorite_vendor" }));
    }
  }

  await Notification.insertMany(notifications);
  if (fcmTasks.length) {
    await Promise.allSettled(fcmTasks);
  }

  logger.info("Favorite vendor notifications sent", {
    vendorId: vendorObjectId.toString(),
    vendorName,
    users: users.length,
    pushes: fcmTasks.length,
  });
}

async function sendPushToUserAndSave(userId, input) {
  const userObjectId = toObjectIdOrNull(userId);
  if (!userObjectId) return null;

  const {
    vendorId,
    title,
    body,
    image = null,
    type = null,
    data = null,
  } = input || {};

  if (!title || !body) return null;

  const vendorObjectId = vendorId ? toObjectIdOrNull(vendorId) : null;
  const notification = await Notification.create({
    user_id: userObjectId,
    vendor_id: vendorObjectId,
    type,
    data,
    title,
    body,
    image,
  });

  const user = await User.findById(userObjectId).select("fcmDeviceTokens").lean();
  const tokens = (user?.fcmDeviceTokens || []).filter(Boolean);

  if (tokens.length) {
    await Promise.allSettled(tokens.map((t) => sendAlert(t, title, body, data)));
  }

  return { notification, pushes: tokens.length };
}

async function sendPushToVendorAndSave(vendorId, input) {
  const vendorObjectId = toObjectIdOrNull(vendorId);
  if (!vendorObjectId) return null;

  const {
    userId,
    title,
    body,
    image = null,
    type = null,
    data = null,
  } = input || {};

  if (!title || !body) return null;

  const userObjectId = userId ? toObjectIdOrNull(userId) : null;
  const notification = await Notification.create({
    user_id: userObjectId,
    vendor_id: vendorObjectId,
    type,
    data,
    title,
    body,
    image,
  });

  const vendor = await Vendor.findById(vendorObjectId).select("fcmDeviceTokens").lean();
  const tokens = (vendor?.fcmDeviceTokens || []).filter(Boolean);

  if (tokens.length) {
    await Promise.allSettled(tokens.map((t) => sendAlert(t, title, body, data)));
  }

  return { notification, pushes: tokens.length };
}

module.exports = {
  notifyUsersNearVendor,
  notifyUsersWhoFavoritedVendor,
  sendPushToUserAndSave,
  sendPushToVendorAndSave,
};
