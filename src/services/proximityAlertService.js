const Notification = require("../models/Notification");
const ProximityAlert = require("../models/ProximityAlert");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const VendorLocation = require("../models/VendorLocation");
const FavoriteVendor = require("../models/FavoriteVendor");
const { sendAlert } = require("./fcmService");
const { getVendorLocationsFromRtdb } = require("./firebaseRtdbService");
const logger = require("../utils/logger");
const mongoose = require("mongoose");

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
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

function isValidObjectIdString(value) {
  return mongoose.Types.ObjectId.isValid(String(value));
}

async function notifyUserNearbyVendorsNow(userId, radiusKm = 5) {
  const user = await User.findById(userId).select("distance_based_alert fcmDeviceTokens lat lng").lean();
  if (!user || !user.distance_based_alert) return;
  if (user.lat == null || user.lng == null) return;

  const vendorLocations = await getVendorLocationsFromRtdb();
  if (!vendorLocations.length) return;

  const vendorIds = vendorLocations.map((v) => v.vendorId).filter(isValidObjectIdString);
  const vendorObjectIds = vendorIds.map((id) => new mongoose.Types.ObjectId(id));
  const vendorDocs = await Vendor.find({ _id: { $in: vendorObjectIds } }).select("name").lean();
  const vendorNameById = new Map(vendorDocs.map((d) => [d._id.toString(), d.name]));

  for (const v of vendorLocations) {
    if (!isValidObjectIdString(v.vendorId)) continue;
    const vendorId = new mongoose.Types.ObjectId(v.vendorId);
    await notifyUsersWhenVendorEntersRadiusAtCoords(
      { vendorId, vendorName: vendorNameById.get(v.vendorId), lat: v.lat, lng: v.lng },
      radiusKm,
      [{ _id: user._id, lat: user.lat, lng: user.lng, fcmDeviceTokens: user.fcmDeviceTokens }]
    );
  }
}

async function notifyUsersWhenVendorEntersRadiusAtCoords(input, radiusKm = 5, usersOverride) {
  const vendorId = input?.vendorId;
  if (!vendorId) return;
  if (input.lat == null || input.lng == null) return;

  const users =
    usersOverride ||
    (await User.find({
      distance_based_alert: true,
      lat: { $ne: null },
      lng: { $ne: null },
    })
      .select("fcmDeviceTokens lat lng")
      .lean());

  if (!users.length) return;

  const userIds = users.map((u) => u._id);
  const existing = await ProximityAlert.find({ user_id: { $in: userIds }, vendor_id: vendorId })
    .select("user_id inside_radius")
    .lean();
  const wasInsideByUserId = new Map(existing.map((e) => [e.user_id.toString(), Boolean(e.inside_radius)]));

  const title = "Vendor nearby";
  const name = input.vendorName || "A vendor";
  const body = `${name} is within ${radiusKm} km of you`;
  const type = "distance_based";
  const data = { vendorId: vendorId.toString(), type };

  const now = new Date();
  const alertOps = [];
  const notifications = [];
  const fcmTasks = [];

  for (const u of users) {
    if (u.lat == null || u.lng == null) continue;
    const distanceKm = calculateDistanceKm(u.lat, u.lng, input.lat, input.lng);
    const inside = distanceKm <= radiusKm;
    const key = u._id.toString();
    const wasInside = wasInsideByUserId.get(key) || false;

    if (inside && !wasInside) {
      alertOps.push({
        updateOne: {
          filter: { user_id: u._id, vendor_id: vendorId },
          update: { $set: { inside_radius: true, last_notified_at: now } },
          upsert: true,
        },
      });

      notifications.push({ user_id: u._id, vendor_id: vendorId, title, body, type, data, created_at: now });

      const tokens = (u.fcmDeviceTokens || []).filter(Boolean);
      for (const t of tokens) {
        fcmTasks.push(sendAlert(t, title, body, data));
      }
      continue;
    }

    if (!inside && wasInside) {
      alertOps.push({
        updateOne: {
          filter: { user_id: u._id, vendor_id: vendorId },
          update: { $set: { inside_radius: false } },
          upsert: true,
        },
      });
    }
  }

  const tasks = [];
  if (alertOps.length) tasks.push(ProximityAlert.bulkWrite(alertOps, { ordered: false }));
  if (notifications.length) tasks.push(Notification.insertMany(notifications));

  if (tasks.length) {
    await Promise.all(tasks);
  }

  if (fcmTasks.length) {
    await Promise.allSettled(fcmTasks);
  }

  if (alertOps.length || notifications.length || fcmTasks.length) {
    logger.info("Proximity alerts processed", {
      vendorId: vendorId.toString(),
      alerts: alertOps.length,
      notifications: notifications.length,
      pushes: fcmTasks.length,
    });
  }
}

async function notifyUserFavoriteVendorsNow(userId, radiusKm = 5) {
  const user = await User.findById(userId)
    .select("favorite_vendor_alert fcmDeviceTokens lat lng")
    .lean();
  if (!user || !user.favorite_vendor_alert) return;
  if (user.lat == null || user.lng == null) return;

  const favorites = await FavoriteVendor.find({ userId: user._id.toString() }).select("vendorId").lean();
  if (!favorites.length) return;

  const favoriteVendorIdSet = new Set(favorites.map((f) => String(f.vendorId)));

  const vendorLocations = await getVendorLocationsFromRtdb();
  if (!vendorLocations.length) return;

  const favoriteVendorLocations = vendorLocations.filter((v) => favoriteVendorIdSet.has(String(v.vendorId)));
  if (!favoriteVendorLocations.length) return;

  const vendorIds = favoriteVendorLocations.map((v) => v.vendorId).filter(isValidObjectIdString);
  const vendorObjectIds = vendorIds.map((id) => new mongoose.Types.ObjectId(id));
  const vendorDocs = await Vendor.find({ _id: { $in: vendorObjectIds } }).select("name").lean();
  const vendorNameById = new Map(vendorDocs.map((d) => [d._id.toString(), d.name]));

  for (const v of favoriteVendorLocations) {
    if (!isValidObjectIdString(v.vendorId)) continue;
    const vendorId = new mongoose.Types.ObjectId(v.vendorId);
    await notifyUsersWhenFavoriteVendorEntersRadiusAtCoords(
      { vendorId, vendorName: vendorNameById.get(v.vendorId), lat: v.lat, lng: v.lng },
      radiusKm,
      [{ _id: user._id, lat: user.lat, lng: user.lng, fcmDeviceTokens: user.fcmDeviceTokens }]
    );
  }
}

async function notifyUsersWhenFavoriteVendorEntersRadiusAtCoords(input, radiusKm = 5, usersOverride) {
  const vendorId = input?.vendorId;
  if (!vendorId) return;
  if (input.lat == null || input.lng == null) return;

  const users = usersOverride || [];
  if (!users.length) return;

  const userIds = users.map((u) => u._id);
  const existing = await ProximityAlert.find({ user_id: { $in: userIds }, vendor_id: vendorId })
    .select("user_id inside_radius")
    .lean();
  const wasInsideByUserId = new Map(existing.map((e) => [e.user_id.toString(), Boolean(e.inside_radius)]));

  const title = "Favorite Vendor Update";
  const name = input.vendorName || "A vendor";
  const body = `Your favourite vendor ${name} is nearby, Go Check them out!`;
  const type = "favorite_vendor";
  const data = { vendorId: vendorId.toString(), type };

  const now = new Date();
  const alertOps = [];
  const notifications = [];
  const fcmTasks = [];

  for (const u of users) {
    if (u.lat == null || u.lng == null) continue;
    const distanceKm = calculateDistanceKm(u.lat, u.lng, input.lat, input.lng);
    const inside = distanceKm <= radiusKm;
    const key = u._id.toString();
    const wasInside = wasInsideByUserId.get(key) || false;

    if (inside && !wasInside) {
      alertOps.push({
        updateOne: {
          filter: { user_id: u._id, vendor_id: vendorId },
          update: { $set: { inside_radius: true, last_notified_at: now } },
          upsert: true,
        },
      });

      notifications.push({ user_id: u._id, vendor_id: vendorId, title, body, type, data, created_at: now });

      const tokens = (u.fcmDeviceTokens || []).filter(Boolean);
      for (const t of tokens) {
        fcmTasks.push(sendAlert(t, title, body, data));
      }
      continue;
    }

    if (!inside && wasInside) {
      alertOps.push({
        updateOne: {
          filter: { user_id: u._id, vendor_id: vendorId },
          update: { $set: { inside_radius: false } },
          upsert: true,
        },
      });
    }
  }

  const tasks = [];
  if (alertOps.length) tasks.push(ProximityAlert.bulkWrite(alertOps, { ordered: false }));
  if (notifications.length) tasks.push(Notification.insertMany(notifications));

  if (tasks.length) {
    await Promise.all(tasks);
  }

  if (fcmTasks.length) {
    await Promise.allSettled(fcmTasks);
  }

  if (alertOps.length || notifications.length || fcmTasks.length) {
    logger.info("Favourite vendor proximity alerts processed", {
      vendorId: vendorId.toString(),
      alerts: alertOps.length,
      notifications: notifications.length,
      pushes: fcmTasks.length,
    });
  }
}

async function notifyUsersWhenVendorEntersRadius(vendor, radiusKm = 5) {
  const vendorId = vendor?._id;
  if (!vendorId) return;

  const coords = await resolveVendorCoords(vendorId, vendor.lat, vendor.lng);
  if (coords.lat == null || coords.lng == null) return;

  await notifyUsersWhenVendorEntersRadiusAtCoords(
    { vendorId, vendorName: vendor.name, lat: coords.lat, lng: coords.lng },
    radiusKm
  );
}

let pollerTimer = null;
let pollerRunning = false;
const lastVendorCoords = new Map();

async function pollVendorsAndNotify() {
  if (pollerRunning) return;
  pollerRunning = true;

  try {
    const vendorLocations = await getVendorLocationsFromRtdb();
    if (!vendorLocations.length) return;

    const thresholdMeters = Number(process.env.PROXIMITY_VENDOR_MOVE_THRESHOLD_METERS || 50);
    const radiusKm = Number(process.env.PROXIMITY_ALERT_RADIUS_KM || 5);

    const changed = [];
    for (const v of vendorLocations) {
      if (!isValidObjectIdString(v.vendorId)) continue;
      const prev = lastVendorCoords.get(v.vendorId);
      if (!prev) {
        changed.push(v);
      } else {
        const movedMeters = calculateDistanceKm(prev.lat, prev.lng, v.lat, v.lng) * 1000;
        if (movedMeters >= thresholdMeters) changed.push(v);
      }
      lastVendorCoords.set(v.vendorId, { lat: v.lat, lng: v.lng });
    }

    if (!changed.length) return;

    const vendorObjectIds = changed.map((v) => new mongoose.Types.ObjectId(v.vendorId));
    const vendorDocs = await Vendor.find({ _id: { $in: vendorObjectIds } }).select("name").lean();
    const vendorNameById = new Map(vendorDocs.map((d) => [d._id.toString(), d.name]));

    const distanceUsers = await User.find({
      distance_based_alert: true,
      lat: { $ne: null },
      lng: { $ne: null },
    })
      .select("fcmDeviceTokens lat lng")
      .lean();

    for (const v of changed) {
      const vendorId = new mongoose.Types.ObjectId(v.vendorId);

      if (distanceUsers.length) {
        await notifyUsersWhenVendorEntersRadiusAtCoords(
          { vendorId, vendorName: vendorNameById.get(v.vendorId), lat: v.lat, lng: v.lng },
          radiusKm,
          distanceUsers
        );
      }

      const favorites = await FavoriteVendor.find({ vendorId: v.vendorId }).select("userId").lean();
      if (!favorites.length) continue;

      const favoriteUserIds = favorites.map((f) => f.userId).filter(isValidObjectIdString);
      if (!favoriteUserIds.length) continue;

      const favoriteUsers = await User.find({
        _id: { $in: favoriteUserIds.map((id) => new mongoose.Types.ObjectId(id)) },
        favorite_vendor_alert: true,
        lat: { $ne: null },
        lng: { $ne: null },
      })
        .select("fcmDeviceTokens lat lng")
        .lean();

      if (!favoriteUsers.length) continue;

      await notifyUsersWhenFavoriteVendorEntersRadiusAtCoords(
        { vendorId, vendorName: vendorNameById.get(v.vendorId), lat: v.lat, lng: v.lng },
        radiusKm,
        favoriteUsers
      );
    }
  } catch (err) {
    logger.error("Vendor proximity poll failed", err);
  } finally {
    pollerRunning = false;
  }
}

function startVendorProximityPoller() {
  if (pollerTimer) return;

  const databaseUrl = process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_RTDB_URL;
  if (!databaseUrl) return;

  const enabledEnv = process.env.PROXIMITY_VENDOR_POLL_ENABLED;
  const enabled = enabledEnv == null ? true : String(enabledEnv).toLowerCase() === "true";
  if (!enabled) return;

  const intervalMs = Number(process.env.PROXIMITY_VENDOR_POLL_INTERVAL_MS || 15000);
  pollerTimer = setInterval(pollVendorsAndNotify, intervalMs);
  pollVendorsAndNotify();
}

module.exports = {
  notifyUsersWhenVendorEntersRadius,
  startVendorProximityPoller,
  notifyUserNearbyVendorsNow,
  notifyUserFavoriteVendorsNow,
};
