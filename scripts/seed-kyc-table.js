#!/usr/bin/env node
/**
 * Seed script to initialize kyc_files table in dev mode.
 * Run: node scripts/seed-kyc-table.js
 */

import devClient from '../api-handlers/dev-db.js';

const db = devClient;

// Initialize the kyc_files table by inserting a dummy record and deleting it
// This forces the dev store to create the table if it doesn't exist
async function seedKycTable() {
  console.log('Seeding kyc_files table in dev store...');
  
  // Insert a dummy record to force table creation
  const dummyRecord = {
    user_id: 'seed-dummy-user',
    kind: 'document_front',
    mime: 'image/png',
    size: 0,
    filename: 'seed.png',
    data_base64: ''
  };
  
  const result = await db.from('kyc_files').insert(dummyRecord);
  
  if (result.error) {
    console.error('Error inserting dummy record:', result.error);
    process.exit(1);
  }
  
  const insertedId = result.data[0]?.id;
  console.log('Inserted dummy record with id:', insertedId);
  
  // Delete the dummy record
  const deleteResult = await db.from('kyc_files').delete().eq('id', insertedId);
  
  if (deleteResult.error) {
    console.error('Error deleting dummy record:', deleteResult.error);
    process.exit(1);
  }
  
  console.log('kyc_files table seeded successfully!');
  console.log('Table is now ready for KYC document uploads.');
}

seedKycTable().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
