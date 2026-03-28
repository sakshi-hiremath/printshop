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
    transactionId: { type: String },
    status: { type: String, default: 'pending' },
    collected: { type: Boolean, default: false },
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
    orderStatus: { type: String, enum: ['active', 'closed', 'printing', 'ready', 'distributed'], default: 'active' },
    assignedCRs: [{
        crId: String,
        crName: String,
        token: String
    }],
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
            expiryTime: new Date(Date.now() + expiryTime * 3600000), // expiryTime is in hours
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
        const { studentId, studentName, transactionId } = req.body;
        
        const poll = await Poll.findById(pollId);
        if (!poll) {
            return res.status(404).json({ message: 'Poll not found' });
        }

        // Validate Transaction ID
        const existingResponse = poll.responses.find(r => r.transactionId === transactionId);
        if (existingResponse) {
            return res.status(400).json({ message: 'Duplicate Transaction ID. Payment proof already submitted.' });
        }

        const newResponse = {
            studentId,
            studentName,
            transactionId,
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
        const poll = await Poll.findByIdAndUpdate(pollId, { 
            status: 'closed',
            orderStatus: 'closed'
        }, { new: true });
        
        if (!poll) {
            return res.status(404).json({ message: 'Poll not found' });
        }

        res.json({ message: 'Poll closed successfully', poll });
    } catch (err) {
        res.status(500).json({ message: 'Error closing poll', error: err.message });
    }
});

// Update Order Status (Printing, Ready, etc.)
app.post('/api/polls/:pollId/order-status', async (req, res) => {
    try {
        const { pollId } = req.params;
        const { orderStatus } = req.body;
        
        const poll = await Poll.findByIdAndUpdate(pollId, { orderStatus }, { new: true });
        if (!poll) return res.status(404).json({ message: 'Poll not found' });
        
        res.json({ message: 'Order status updated', poll });
    } catch (err) {
        res.status(500).json({ message: 'Error updating order status' });
    }
});

// Mark student order as collected
app.post('/api/polls/:pollId/responses/:studentId/collect', async (req, res) => {
    try {
        const { pollId, studentId } = req.params;
        const { collected } = req.body;
        
        const poll = await Poll.findById(pollId);
        if (!poll) return res.status(404).json({ message: 'Poll not found' });
        
        const response = poll.responses.find(r => r.studentId === studentId);
        if (!response) return res.status(404).json({ message: 'Response not found' });
        
        response.collected = collected;
        await poll.save();
        
        res.json({ message: 'Collection status updated', response });
    } catch (err) {
        res.status(500).json({ message: 'Error updating collection status' });
    }
});

// Assign CR with Token to Poll
app.post('/api/polls/:pollId/assign-cr', async (req, res) => {
    try {
        const { pollId } = req.params;
        const { crId, crName, token } = req.body;
        
        const poll = await Poll.findById(pollId);
        if (!poll) return res.status(404).json({ message: 'Poll not found' });
        
        if (!poll.assignedCRs) poll.assignedCRs = [];
        poll.assignedCRs.push({ crId, crName, token });
        await poll.save();
        
        res.json({ message: 'CR assigned successfully', poll });
    } catch (err) {
        res.status(500).json({ message: 'Error assigning CR' });
    }
});

// Serve frontend files (Catch-all)
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
