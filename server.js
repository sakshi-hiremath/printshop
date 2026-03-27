const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/printshop';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- Schemas ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['cr', 'student'], required: true },
    email: { type: String }
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

const responseSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    paymentScreenshot: String,
    status: { type: String, default: 'pending' },
    timestamp: { type: Date, default: Date.now }
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

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
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

const User = mongoose.model('User', userSchema);
const Poll = mongoose.model('Poll', pollSchema);

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer setup for payment screenshots
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- Auth Routes ---
app.post('/api/signup', async (req, res) => {
    try {
        const { username, password, role, email } = req.body;
        const existingUser = await User.findOne({ username });
        
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const newUser = new User({ username, password, role, email });
        await newUser.save();

        res.status(201).json({ 
            message: 'User created successfully', 
            user: { id: newUser._id, username, role } 
        });
    } catch (err) {
        res.status(500).json({ message: 'Error during signup', error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        res.json({ 
            message: 'Login successful', 
            user: { id: user._id, username: user.username, role: user.role } 
        });
    } catch (err) {
        res.status(500).json({ message: 'Error during login', error: err.message });
    }
});

// --- Poll Routes ---
app.get('/api/polls', async (req, res) => {
    try {
        const polls = await Poll.find().sort({ expiryTime: -1 });
        res.json(polls);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching polls' });
    }
});

app.post('/api/polls', async (req, res) => {
    try {
        const { title, subject, pricePerCopy, description, qrCode, expiryTime, createdBy } = req.body;
        
        const newPoll = new Poll({
            title,
            subject,
            pricePerCopy,
            description,
            qrCode,
            expiryTime: new Date(Date.now() + expiryTime * 60000),
            createdBy,
            status: 'active'
        });

        await newPoll.save();
        res.status(201).json(newPoll);
    } catch (err) {
        res.status(500).json({ message: 'Error creating poll', error: err.message });
    }
});

app.post('/api/polls/:pollId/join', upload.single('paymentScreenshot'), async (req, res) => {
    try {
        const { pollId } = req.params;
        const { studentId, studentName } = req.body;

        const poll = await Poll.findById(pollId);
        if (!poll) {
            return res.status(404).json({ message: 'Poll not found' });
        }

        const newResponse = {
            studentId,
            studentName,
            paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : null,
            status: 'pending',
            timestamp: new Date()
        };

        poll.responses.push(newResponse);
        await poll.save();

        res.status(200).json({ message: 'Joined poll successfully', response: newResponse });
    } catch (err) {
        console.error('Error joining poll:', err);
        res.status(500).json({ message: 'Error joining poll', error: err.message, stack: err.stack });
    }
});

app.post('/api/polls/:pollId/verify', async (req, res) => {
    try {
        const { pollId } = req.params;
        const { studentId, status } = req.body; // status: 'verified' or 'rejected'

        const poll = await Poll.findById(pollId);
        if (!poll) {
            return res.status(404).json({ message: 'Poll not found' });
        }

        const response = poll.responses.find(r => r.studentId === studentId);
        if (!response) {
            return res.status(404).json({ message: 'Response not found' });
        }

        response.status = status;
        await poll.save();

        res.json({ message: 'Verification successful', response });
    } catch (err) {
        res.status(500).json({ message: 'Error verifying payment', error: err.message });
    }
});

app.post('/api/polls/:pollId/close', async (req, res) => {
    try {
        const { pollId } = req.params;
        const poll = await Poll.findByIdAndUpdate(pollId, { status: 'closed' }, { new: true });
        
        if (!poll) {
            return res.status(404).json({ message: 'Poll not found' });
        }

        res.json({ message: 'Poll closed successfully', poll });
    } catch (err) {
        res.status(500).json({ message: 'Error closing poll', error: err.message });
    }
});

// Serve frontend files (Catch-all)
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
