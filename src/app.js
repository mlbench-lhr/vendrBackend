const express = require('express');
const morgan = require('morgan');
const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json());
app.use(morgan('dev'));
app.use('/api/auth', authRoutes);

app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

module.exports = app;
