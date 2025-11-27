const mongoose = require('mongoose');
const logger = require('../utils/logger');

module.exports = async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI not provided');
  mongoose.set('strictQuery', false);
  try {
    await mongoose.connect(uri, {});
    logger.info('MongoDB connected');
    mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
  } catch (err) {
    logger.error('MongoDB connection failed', err);
    throw err;
  }
};
