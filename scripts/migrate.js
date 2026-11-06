'use strict';
const { getDb, migrate } = require('../lib/sima/db');
(async () => { const db = getDb(); await migrate(db); console.log('Skema database siap.'); await db.close(); })().catch(e => { console.error(e.message); process.exit(1); });
