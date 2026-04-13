require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Connected to MongoDB');
    const userCollection = mongoose.connection.collection('users');
    
    // Delete all users where role is not 'admin'
    const result = await userCollection.deleteMany({ role: { $ne: 'admin' } });
    
    console.log(`Deleted ${result.deletedCount} non-admin users.`);
    mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error', err);
    process.exit(1);
  });
