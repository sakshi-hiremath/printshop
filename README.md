# 🖨️ PrintShop: Campus Bulk-Order & Queue Manager

**PrintShop** is a smart digital queue management system designed for college print shops. It eliminates exam-season chaos by allowing Class Representatives (CRs) to launch timed print polls and students to join via digital payment verification.

## 🚀 Features
- **Timed Polls**: CRs can set expiry timers for bulk orders.
- **UPI Integration**: In-app QR codes for seamless payments.
- **Automatic Lists**: Generates verified student lists for the print shop.
- **Status Tracking**: Real-time updates for students on their order status.

## 🛠️ Tech Stack
- **Frontend**: Tailwind CSS, Glassmorphism UI, AOS Animations.
- **Backend**: Node.js, Express.
- **Database**: MongoDB (Mongoose).
- **File Handling**: Multer (for payment screenshots).

## 💻 How to Run Locally
1. **Clone the repository**:
   ```bash
   git clone https://github.com/sakshi-hiremath/printshop.git
   cd printshop
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Set up MongoDB**:
   Ensure you have MongoDB running locally or use a MongoDB Atlas connection string in a `.env` file.
4. **Start the server**:
   ```bash
   npm start
   ```
5. **Open in browser**:
   Visit [http://localhost:5000](http://localhost:5000)

## 🌐 Live Demo & Hosting
The code is hosted on GitHub, but the actual website must be hosted on a platform that supports Node.js (like **Render** or **Railway**). 

For step-by-step deployment instructions, please see the [Deployment Guide](deployment_guide.md).

---
Built for **Hackathon - III** | Smart campus solution for bulk printing & queue management.
