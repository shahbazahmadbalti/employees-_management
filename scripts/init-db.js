// Run this script to initialize the database tables and seed data
// Usage: POSTGRES_URL="your-connection-string" node scripts/init-db.js
const { initializeTables, seedDataIfEmpty } = require('../database');

async function main() {
    console.log('Initializing Duna Networks EMS database...');
    await initializeTables();
    await seedDataIfEmpty();
    console.log('Done!');
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
