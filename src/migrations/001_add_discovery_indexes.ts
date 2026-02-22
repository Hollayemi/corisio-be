/**
 * Migration: Add public store discovery indexes
 *
 * Run ONCE against your MongoDB database before deploying the public discovery
 * milestone. Safe to run on a live database — MongoDB creates indexes in the
 * background by default (background: true).
 *
 * Usage:
 *   npx ts-node src/migrations/001_add_discovery_indexes.ts
 *
 * Or compile first:
 *   npx tsc && node dist/migrations/001_add_discovery_indexes.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function run(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);

    const db = mongoose.connection.db;
    const stores = db.collection('stores');

    console.log('\nChecking existing indexes...');
    const existingIndexes = await stores.indexes();
    const existingNames = existingIndexes.map((i: any) => i.name);
    console.log('Existing indexes:', existingNames);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Compound index for discovery query base filter
    //    Used by $geoNear query: { onboardingStatus, isActive, createdAt }
    // ─────────────────────────────────────────────────────────────────────────
    const discoveryIndexName = 'onboardingStatus_1_isActive_1_createdAt_-1';
    if (existingNames.includes(discoveryIndexName)) {
        console.log(`\n[SKIP] Index '${discoveryIndexName}' already exists`);
    } else {
        console.log(`\n[CREATE] ${discoveryIndexName}...`);
        await stores.createIndex(
            { onboardingStatus: 1, isActive: 1, createdAt: -1 },
            { background: true, name: discoveryIndexName }
        );
        console.log(`[OK] ${discoveryIndexName} created`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Text index for store name + description search
    //    IMPORTANT: MongoDB only allows ONE text index per collection.
    //    If you already have a text index, you must drop it first or merge fields.
    // ─────────────────────────────────────────────────────────────────────────
    const textIndexName = 'store_text_search';
    if (existingNames.includes(textIndexName)) {
        console.log(`\n[SKIP] Text index '${textIndexName}' already exists`);
    } else {
        // Check if ANY text index exists (conflict guard)
        const existingTextIndex = existingIndexes.find((i: any) =>
            Object.values(i.key as object).includes('text')
        );
        if (existingTextIndex) {
            console.warn(
                `\n[WARN] A text index named '${existingTextIndex.name}' already exists.` +
                `\n       MongoDB only allows one text index per collection.` +
                `\n       Drop it first with: db.stores.dropIndex("${existingTextIndex.name}") ` +
                `\n       Then re-run this migration.`
            );
        } else {
            console.log(`\n[CREATE] ${textIndexName}...`);
            await stores.createIndex(
                { storeName: 'text', description: 'text' },
                {
                    background: true,
                    weights: { storeName: 3, description: 1 },
                    name: textIndexName,
                }
            );
            console.log(`[OK] ${textIndexName} created`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Verify 2dsphere index exists (created by Mongoose, but confirm)
    // ─────────────────────────────────────────────────────────────────────────
    const geoIndexExists = existingIndexes.some((i: any) =>
        Object.values(i.key as object).includes('2dsphere')
    );
    if (geoIndexExists) {
        console.log('\n[OK] 2dsphere geo index confirmed present');
    } else {
        console.warn('\n[WARN] 2dsphere index NOT found — run Mongoose schema sync first');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────────────────────
    const finalIndexes = await stores.indexes();
    console.log('\n=== Final index list ===');
    finalIndexes.forEach((idx: any) => {
        console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log('\n[DONE] Migration complete');
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error('[FATAL]', err.message);
    process.exit(1);
});
