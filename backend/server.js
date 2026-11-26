// server.js
//
// Entry point. Mounts auth (open) and the two protected resource routers
// (poles, inspections — both gate individual endpoints internally via
// requireAuth/requireRole from middleware/auth.js, see those files).
//
// /uploads is now behind requireAuth too: review images contain site
// infrastructure photos and should not be a public static folder just
// because Express makes that easy. The in-app reviewer (React Native
// Image component) sends the JWT as an Authorization header on image
// requests, same as any other API call — see ReviewerScreen.tsx.

const express = require('express');
const cors = require('cors');
const path = require('path');

const { initSchema } = require('./db');
const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const polesRouter = require('./routes/poles');
const inspectionsRouter = require('./routes/inspections');

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => console.log(req.method, req.url, res.statusCode));
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.urlencoded({ extended: true }));

app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Optional: log every request so you can see uploads arriving
app.use((req, res, next) => { console.log(req.method, req.url); next(); });

app.use('/api/auth', authRouter);
app.use('/api/poles', polesRouter);
app.use('/api/inspections', inspectionsRouter);

const PORT = process.env.PORT || 4000;

initSchema()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Pole inspection backend running on ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize schema — is Postgres running? (docker compose up -d)', err);
    process.exit(1);
  });
