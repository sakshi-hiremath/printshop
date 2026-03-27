const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');
const MONGODB_URI = 'mongodb://localhost:27017/printshop';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['cr', 'student'], required: true },
    email: { type: String }
});

const responseSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    paymentScreenshot: String,
    status: { type: String, default: 'pending' },
    timestamp: { type: Date, default: Date.now }
});

const pollSchema = new mongoose.Schema({
    title: String,
    subject: String,
    pricePerCopy: Number,
    description: String,
    qrCode: String,
    expiryTime: Date,
    createdBy: String,
    status: { type: String, default: 'active' },
    responses: [responseSchema]
});

const User = mongoose.model('User', userSchema);
const Poll = mongoose.model('Poll', pollSchema);

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        if (!fs.existsSync(DB_FILE)) {
            console.log('db.json not found, skipping migration');
            process.exit(0);
        }

        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

        // Migrate Users
        for (const user of data.users) {
            const existing = await User.findOne({ username: user.username });
            if (!existing) {
                await new User({
                    username: user.username,
                    password: user.password,
                    role: user.role,
                    email: user.email
                }).save();
                console.log(`Migrated user: ${user.username}`);
            }
        }

        // Migrate Polls
        for (const poll of data.polls) {
            // Check if poll already exists (simple title + subject check)
            const existing = await Poll.findOne({ title: poll.title, subject: poll.subject });
            if (!existing) {
                await new Poll({
                    title: poll.title,
                    subject: poll.subject,
                    pricePerCopy: poll.pricePerCopy,
                    description: poll.description,
                    qrCode: poll.qrCode,
                    expiryTime: new Date(poll.expiryTime),
                    createdBy: poll.createdBy,
                    status: poll.status,
                    responses: poll.responses
                }).save();
                console.log(`Migrated poll: ${poll.title}`);
            }
        }

        console.log('Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
