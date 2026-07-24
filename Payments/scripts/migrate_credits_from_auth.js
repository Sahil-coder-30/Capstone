import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Credit from '../models/credit.model.js';

dotenv.config();

const AUTH_MONGO_URI = process.env.AUTH_MONGO_URI || process.env.MONGO_URI?.replace('/payment', '/auth') || 'mongodb+srv://sahilsharma3043_db_user:2QJubwa1I50rIl1Y@cluster0.uxnla51.mongodb.net/auth';
const PAYMENTS_MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://sahilsharma3043_db_user:2QJubwa1I50rIl1Y@cluster0.uxnla51.mongodb.net/payment';

async function migrateData() {
  console.log('====================================================');
  console.log('🚀 Starting Data Migration: Auth DB -> Payments DB');
  console.log('====================================================\n');

  console.log(`Connecting to Auth DB: ${AUTH_MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  const authConn = await mongoose.createConnection(AUTH_MONGO_URI).asPromise();
  console.log('✓ Connected to Auth DB');

  console.log(`Connecting to Payments DB: ${PAYMENTS_MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  const paymentsConn = await mongoose.createConnection(PAYMENTS_MONGO_URI).asPromise();
  console.log('✓ Connected to Payments DB');

  // Auth Models
  const AuthUser = authConn.model('user', new mongoose.Schema({
    email: String,
    name: String,
    subscription: String,
  }, { strict: false }));

  const AuthCredit = authConn.model('credit', new mongoose.Schema({}, { strict: false }));

  // Payments Model
  const PaymentsCredit = paymentsConn.model('credit', Credit.schema);

  const authUsers = await AuthUser.find({});
  const authCredits = await AuthCredit.find({});

  console.log(`\nFound ${authUsers.length} Users and ${authCredits.length} Credit records in Auth DB.`);

  let migratedCount = 0;
  let createdCount = 0;

  for (const user of authUsers) {
    const userId = user._id;
    const existingAuthCredit = authCredits.find(c => String(c.userId) === String(userId));
    const userSubscription = user.subscription || existingAuthCredit?.subscription || 'free';

    let creditDataToSave = {};

    if (existingAuthCredit) {
      const creditObj = existingAuthCredit.toObject();
      delete creditObj._id;
      delete creditObj.__v;
      creditDataToSave = {
        ...creditObj,
        userId,
        subscription: userSubscription,
      };
      migratedCount++;
    } else {
      creditDataToSave = {
        userId,
        subscription: userSubscription,
      };
      createdCount++;
    }

    await PaymentsCredit.findOneAndUpdate(
      { userId },
      { $set: creditDataToSave },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`  ✓ Synced credit & subscription [${userSubscription}] for User ${userId} (${user.email || 'N/A'})`);
  }

  console.log('\n====================================================');
  console.log(`🎉 Migration Completed Successfully!`);
  console.log(`   - Existing Credit Records Migrated: ${migratedCount}`);
  console.log(`   - New Credit Documents Created: ${createdCount}`);
  console.log(`   - Total Users Synced: ${authUsers.length}`);
  console.log('====================================================\n');

  await authConn.close();
  await paymentsConn.close();
  process.exit(0);
}

migrateData().catch(err => {
  console.error('❌ Data Migration Failed:', err);
  process.exit(1);
});
