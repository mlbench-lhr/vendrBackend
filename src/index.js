const dotenv = require('dotenv');
dotenv.config();
const http = require('http');
const app = require('./app');
const connectDB = require('./db/mongo');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    const server = http.createServer(app);
    server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled Rejection', err);
      process.exit(1);
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', err);
      process.exit(1);
    });
  } catch (err) {
    logger.error('Failed to start', err);
    process.exit(1);
  }
})();
