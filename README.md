# 🚀 Digital Twin System - Complete Setup Guide
## 2-DOF Robotic Arm Predictive Maintenance System

---

## 📁 Project Structure

```
digital-twin-project/
├── backend/
│   ├── digital_twin.py          # Main Python implementation
│   ├── requirements.txt          # Python dependencies
│   ├── api_server.py            # Flask REST API
│   └── data/                    # Generated data
├── frontend/
│   ├── package.json             # Node.js dependencies
│   ├── src/
│   │   ├── App.js               # Main React component
│   │   ├── App.css              # Styling
│   │   ├── index.js             # Entry point
│   │   └── index.css            # Global styles
│   └── public/
│       └── index.html           # HTML template
└── README.md
```

---

## 🔧 OPTION 1: Simple Setup (Recommended for Beginners)

### Step 1: Install Python & Run Backend Only

This option runs just the Python simulation with matplotlib plots.

#### A. Install Python

**Windows:**
1. Download Python 3.8+ from [python.org](https://www.python.org/downloads/)
2. ✅ Check "Add Python to PATH" during installation
3. Click "Install Now"

**Mac:**
```bash
# Using Homebrew
brew install python3
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install python3 python3-pip
```

#### B. Verify Installation
```bash
python --version
# Should show: Python 3.8.x or higher

pip --version
# Should show: pip 21.x.x or higher
```

#### C. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

Wait 2-3 minutes for installation...

#### D. Run the Project
```bash
python digital_twin.py
```

**Expected Output:**
- Console output showing progress
- Plot windows will appear
- Files generated: `fom_simulation.png`

✅ **Done! You now have a working digital twin system.**

---

## 🌐 OPTION 2: Full Stack Setup (Frontend + Backend)

### For professional dashboard with web interface

---

## Part A: Backend Setup (Python + Flask API)

### Step 1: Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Step 2: Test Backend
```bash
python api_server.py
```

You should see:
```
Starting Digital Twin API Server...
Server will run on http://localhost:5000
 * Running on http://127.0.0.1:5000
```

✅ **Backend is ready!** Keep this terminal open.

---

## Part B: Frontend Setup (React)

### Step 1: Install Node.js

**Windows:**
1. Download Node.js LTS from [nodejs.org](https://nodejs.org/)
2. Run installer (accept all defaults)
3. Restart computer

**Mac:**
```bash
brew install node
```

**Linux:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Step 2: Verify Installation
```bash
node --version
# Should show: v18.x.x or higher

npm --version
# Should show: 9.x.x or higher
```

### Step 3: Install Frontend Dependencies

Open a **NEW terminal** (keep backend running), then:

```bash
cd frontend
npm install
```

### Step 4: Start Frontend
```bash
npm start
```

Browser will automatically open to `http://localhost:3000`

---

## 🎉 Complete System Running!

You should now have:

1. **Backend running** on `http://localhost:5000`
   - Terminal 1 showing Flask server logs

2. **Frontend running** on `http://localhost:3000`
   - Terminal 2 showing React dev server
   - Browser showing dashboard

---

## 📝 How to Use the Complete System

### Step 1: Initialize
Click "Initialize Digital Twin" button
- Wait 30-60 seconds for training
- You'll see success message

### Step 2: Run Simulation
Option A: Click "Run Single Cycle"
Option B: Click "Start Continuous Mode" (auto-increases degradation)

### Step 3: Adjust Degradation
Use the slider to set different degradation levels (0-100%)

### Step 4: Monitor Results
- Watch metrics update in real-time
- See alerts when thresholds crossed
- View historical charts

---

## 🛠️ Troubleshooting

### Backend Issues

**Problem: Port 5000 already in use**
```python
# In api_server.py, change the port:
app.run(debug=True, port=5001)  # Use 5001 instead

# Then update frontend API_URL in App.js:
const API_URL = 'http://localhost:5001/api';
```

**Problem: CORS errors**
```bash
pip install flask-cors
# Verify it's imported in api_server.py
```

### Frontend Issues

**Problem: Cannot connect to backend**
- Ensure backend is running in separate terminal
- Check `http://localhost:5000/api/health` in browser
- Verify API_URL in App.js matches backend port

**Problem: npm start fails**
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
npm start
```

---

## 📦 Quick Start Commands Summary

```bash
# Backend Terminal (Terminal 1)
cd digital-twin-project/backend
pip install -r requirements.txt
python api_server.py

# Frontend Terminal (Terminal 2)
cd digital-twin-project/frontend
npm install
npm start
```

---

## 🎯 For Presentation

### Demo Flow:
1. Show backend terminal (Flask running)
2. Show frontend dashboard
3. Click "Initialize Digital Twin"
4. Start continuous simulation
5. Watch degradation increase
6. Point out when alerts trigger
7. Explain the metrics

### Screenshots to Take:
1. Dashboard at 0% degradation (healthy)
2. Dashboard at 60% (anomaly detected)
3. Dashboard at 90% (critical alert)
4. Historical charts showing trends

---

## 💾 Saving Your Work

Create `.gitignore`:
```
# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
*.egg-info/

# Node
node_modules/
build/
.DS_Store

# Data
*.png
*.csv
data/
```

Initialize git:
```bash
git init
git add .
git commit -m "Initial commit: Digital Twin System"
```

---

## 🔬 System Architecture

### Backend Components:
- **FOM (Full Order Model)**: Complete physics simulation of 2-DOF robotic arm
- **ROM (Reduced Order Model)**: POD-based model reduction for faster computation
- **Anomaly Detector**: Isolation Forest for detecting abnormal behavior
- **RUL Predictor**: Linear regression for remaining useful life estimation
- **Smart Digital Twin**: Integration layer combining all components

### Frontend Components:
- **React Dashboard**: Real-time visualization of system metrics
- **Interactive Controls**: Degradation slider and simulation controls
- **Historical Charts**: Time-series visualization using Recharts
- **Alert System**: Color-coded maintenance recommendations

### Key Features:
- Real-time physics simulation
- Machine learning-based anomaly detection
- Predictive maintenance recommendations
- Interactive web dashboard
- RESTful API architecture

---

## 📊 System Metrics

The dashboard displays:
- **System Health**: Overall health percentage (0-100%)
- **RUL**: Remaining Useful Life in hours
- **Temperature**: Motor temperature in °C
- **Anomaly Score**: Anomaly detection score (0-100%)
- **Vibration**: System vibration levels
- **Current**: Motor current consumption

---

## ✅ Final Checklist

- [ ] Python 3.8+ installed
- [ ] Node.js 18+ installed
- [ ] Backend dependencies installed
- [ ] Frontend dependencies installed
- [ ] Backend running on port 5000
- [ ] Frontend running on port 3000
- [ ] Can initialize system
- [ ] Can run simulations
- [ ] Dashboard displays correctly
- [ ] Charts update in real-time

---

## 🚀 Next Steps

1. **Extend the Model**: Add more complex physics (flexibility, backlash)
2. **Improve ML Models**: Use more sophisticated algorithms (LSTM, CNN)
3. **Add More Sensors**: Include accelerometers, encoders, force sensors
4. **Database Integration**: Store historical data in PostgreSQL/MongoDB
5. **Deploy to Cloud**: Use Docker containers and cloud platforms
6. **Mobile App**: Create React Native mobile dashboard

---

**You're all set! Both frontend and backend are now running locally! 🚀**

For questions or issues, check the troubleshooting section or create an issue in the repository.





