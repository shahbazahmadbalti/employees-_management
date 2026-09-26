// Local development server
// On Vercel, the api/index.js serverless function handles API routes directly
const path = require('path');
const express = require('express');
const app = require('./api/index');

// Serve static files for local dev (Vercel serves them automatically in production)
app.use(express.static(path.join(__dirname)));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Duna Networks EMS running at http://localhost:${PORT}`);
});
