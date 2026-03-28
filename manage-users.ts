import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || '';

async function run() {
  if (!uri) {
    console.error('No MONGODB_URI in .env');
    process.exit(1);
  }

  const action = process.argv[2]; // 'list' or 'delete'
  const emailToDelete = process.argv[3]; // email address (for delete)

  try {
    await mongoose.connect(uri);
    const usersCollection = mongoose.connection.collection('users');

    if (action === 'delete' && emailToDelete) {
      // ── Delete a specific user by email ──
      const user = await usersCollection.findOne({ email: emailToDelete });
      if (!user) {
        console.log(`\n❌ No account found with email: ${emailToDelete}`);
      } else {
        await usersCollection.deleteOne({ email: emailToDelete });
        console.log(`\n✅ Deleted account: ${user.email} (Role: ${user.role})`);
      }
    } else if (action === 'delete-all') {
      // ── Delete ALL users ──
      const count = await usersCollection.countDocuments();
      await usersCollection.deleteMany({});
      console.log(`\n✅ Deleted all ${count} accounts.`);
    } else {
      // ── Default: List all accounts ──
      const users = await usersCollection.find({}).toArray();
      if (users.length === 0) {
        console.log('\nNo accounts found in the database.');
      } else {
        console.log(`\n📋 Found ${users.length} account(s):\n`);
        console.log('─'.repeat(80));
        users.forEach((u, i) => {
          console.log(`  ${i + 1}. Email:    ${u.email}`);
          console.log(`     Name:     ${u.firstName} ${u.lastName}`);
          console.log(`     Role:     ${u.role}`);
          console.log(`     Verified: ${u.isVerified ? '✅ Yes' : '❌ No'}`);
          console.log(`     Created:  ${u.createdAt || 'N/A'}`);
          console.log('─'.repeat(80));
        });
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
