const express = require('express');
const morgan = require('morgan');
const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json());
app.use(morgan('dev'));
app.use('/api/auth', authRoutes);
app.get('/', (req, res) => {
  res.json({ 
    message: 'Vendr API Server', 
    status: 'running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});
app.use(errorHandler);

module.exports = app;
