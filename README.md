# Vender Backend — Node.js + Express + MongoDB Authentication API

A production-ready backend for mobile applications using:

- Node.js + Express  
- MongoDB (Mongoose)  
- JWT Access + Refresh Tokens  
- bcrypt password hashing  
- Joi validation  
- Nodemailer (OTP emails)  
- User + Vendor authentication  
- Password reset via OTP  

This backend is structured for scalability, clean separation of concerns, and mobile-first API workflows.

---

## Features

### User Authentication
- Register  
- Login  
- OAuth (Google / Apple)  
- Logout  
- Refresh token  

### Vendor Authentication
- Register  
- Login  
- OAuth  
- Logout  
- Refresh token  

### Password Reset (Shared for User & Vendor)
- Request OTP  
- Verify OTP  
- Reset password  

### Security & Best Practices
- JWT Access + Refresh tokens  
- Strong bcrypt hashing  
- Joi input validation  
- Central error handler  
- Email OTP delivery  
- Mongoose schema validation  

---

## Prerequisites

- Node.js 16+
- npm
- MongoDB (local or Atlas)

---

## Setup Instructions

Setup:

1. Clone or copy project files into a directory.
2. Copy .env.example to .env and set values:
   cp .env.example .env
   Edit .env and set JWT secrets and MONGO_URI.
3. Install dependencies:
   npm install
4. Start the app:
   npm start
   Or for development with auto-reload:
   npm run dev

Configuration (environment variables):
- NODE_ENV: development/production
- PORT: port to listen on (default 3000)
- MONGO_URI: MongoDB connection URI
- JWT_ACCESS_SECRET: secret for signing access tokens
- JWT_REFRESH_SECRET: secret for signing refresh tokens
- ACCESS_TOKEN_EXPIRES_IN: e.g. 15m
- REFRESH_TOKEN_EXPIRES_IN: e.g. 7d


Notes:
- Refresh tokens are JWTs and are not stored server-side. Logging out does not revoke tokens on the server.
- Replace JWT secrets with strong random values in production.
- For production, run behind a reverse proxy and enable HTTPS.

Troubleshooting:
- MongoDB connection error: ensure MongoDB is running and MONGO_URI is correct.
- Missing env vars: Copy .env.example to .env and populate values.
- Port in use: change PORT in .env.

Project structure:
- package.json - dependencies and scripts
- .env.example - example environment variables
- src/
  - index.js - entry point (starts server and connects DB)
  - app.js - express app configuration
  - db/mongo.js - mongoose connection helper
  - models/User.js - Mongoose user model
  - services/passwordService.js - hashing and comparing passwords
  - services/jwtService.js - sign/verify access and refresh tokens
  - controllers/authController.js - register/login/refresh/logout logic
  - routes/auth.js - auth routes
  - middleware/validate.js - Joi validation middleware
  - middleware/validators.js - Joi schemas
  - middleware/auth.js - access-token protection middleware
  - middleware/errorHandler.js - centralized error handler
  - utils/logger.js - simple logger wrapper

