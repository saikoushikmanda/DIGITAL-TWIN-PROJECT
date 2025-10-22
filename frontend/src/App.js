import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { AlertCircle, Activity, Gauge, Zap, TrendingUp, AlertTriangle, ShieldCheck, Wrench, RotateCw } from 'lucide-react';

// NOTE: This must be the address where the backend API is running.
// The project now uses FastAPI on port 5000 for this environment; update if your server uses a different host/port.
const API_URL = 'http://127.0.0.1:5000/api/simulate';

// --- Helper for Dial Gauge ---
const HealthDial = ({ health }) => {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (health / 100) * circumference;

    let color = 'text-green-500';
    if (health <= 80) color = 'text-yellow-500';
    if (health <= 40) color = 'text-red-500';

    // Tailwind classes are used directly for SVG styling
    return (
        <div className="flex flex-col items-center justify-center relative w-[160px] h-[160px]">
            <svg viewBox="0 0 140 140" className="w-full h-full transform rotate-[135deg]">
                {/* Background arc */}
                <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="#273244"
                    strokeWidth="15"
                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                    strokeLinecap="round"
                />
                {/* Health arc */}
                <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    strokeWidth="15"
                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                    strokeDashoffset={offset * (3/4) / 0.75}
                    strokeLinecap="round"
                    className={color.replace('text-', 'stroke-')}
                    style={{ transition: 'stroke-dashoffset 0.5s' }}
                />
            </svg>
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center ${color}`}>
                <p className="text-3xl font-bold">{health.toFixed(1)}%</p>
                <p className="text-sm font-semibold mt-1">Health</p>
            </div>
        </div>
    );
};

// --- Helper for Frequency Spectrum Data ---
const generateFrequencyData = (degradationLevel, faultType) => {
    const baseAmplitude = 10;
    const data = [];

    // The degradation factor now depends on the fault type
    let outerRaceFactor = 0;
    let misalignmentFactor = 0;

    if (faultType === 'bearing') {
        outerRaceFactor = degradationLevel * 5; 
    } else if (faultType === 'misalignment') {
        misalignmentFactor = degradationLevel * 6; 
    } else {
        // Default degradation
        outerRaceFactor = degradationLevel * 1; 
    }

    for (let f = 1; f <= 50; f += 1) {
        let amplitude = baseAmplitude + Math.random() * 2;
        let currentFault = 'None';
        
        // Characteristic Frequencies (simulate bearing/misalignment faults)
        if (f === 10) { // Baseline (Running Speed)
            amplitude += 5;
        } else if (f === 25) { // Outer Race Fault (Degradation sensitive)
            amplitude += outerRaceFactor * 3 + Math.random() * 5;
            currentFault = 'Outer Race';
        } else if (f === 40) { // Misalignment (Degradation sensitive)
            amplitude += misalignmentFactor * 2 + Math.random() * 3;
            currentFault = 'Misalignment';
        }
        
        data.push({
            frequency: f,
            amplitude: Math.max(0, amplitude),
            fault: currentFault
        });
    }

    return data;
};


const DigitalTwinDashboard = () => {
    // --- State Variables ---
    const [isRunning, setIsRunning] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const currentTimeRef = useRef(0);
    const tickCounterRef = useRef(0);
    const [systemHealth, setSystemHealth] = useState(100);
    const [rul, setRul] = useState(200); // Initial RUL matching backend RUL_MAX
    const [anomalyScore, setAnomalyScore] = useState(0);
    const [motorTemp, setMotorTemp] = useState(25);
    const [vibration, setVibration] = useState(0.5);
    const [historicalData, setHistoricalData] = useState([]);
    const [degradationLevel, setDegradationLevel] = useState(0); // 0 (new) to 1 (failed)
    const [activeFault, setActiveFault] = useState('none'); // 'none', 'bearing', 'misalignment'
    const [frequencySpectrum, setFrequencySpectrum] = useState(generateFrequencyData(0, 'none'));
    const [alerts, setAlerts] = useState([]);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isServerAvailable, setIsServerAvailable] = useState(false);
    const healthCheckRef = useRef(null);
    const [stoppedDueToFailure, setStoppedDueToFailure] = useState(false);
    // Audio refs for alarm
    const audioCtxRef = useRef(null);
    const oscRef = useRef(null);

    const playBeep = (freq = 880, duration = 300, repeat = 1, gap = 200) => {
        try {
            if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = audioCtxRef.current;
            let count = 0;
            const playOnce = () => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = freq;
                g.gain.value = 0.001;
                o.connect(g);
                g.connect(ctx.destination);
                o.start();
                // ramp up then down for smoother sound
                g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02);
                setTimeout(() => {
                    g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.02);
                    try { o.stop(); } catch (e) {}
                }, duration);
            };
            const interval = setInterval(() => {
                if (count >= repeat) {
                    clearInterval(interval);
                    return;
                }
                playOnce();
                count += 1;
            }, duration + gap);
            // store one oscillator ref so stopBeep can close context if needed
            oscRef.current = { stop: () => { clearInterval(interval); } };
            return oscRef.current;
        } catch (e) {
            console.warn('Audio not available', e);
            return null;
        }
    };

    const stopBeep = () => {
        try {
            if (oscRef.current && typeof oscRef.current.stop === 'function') oscRef.current.stop();
            if (audioCtxRef.current && typeof audioCtxRef.current.close === 'function') {
                audioCtxRef.current.close();
                audioCtxRef.current = null;
            }
            oscRef.current = null;
        } catch (e) {
            console.warn('stopBeep failed', e);
        }
    };

    // --- Utility Functions (using derived state) ---
    const getRULText = (rul) => {
        if (rul > 70) return `${rul.toFixed(0)} cycles remaining`;
        if (rul > 30) return `${rul.toFixed(0)} cycles remaining - HIGH RISK`;
        return `CRITICAL: ${rul.toFixed(0)} cycles remaining`;
    };

    const getRULColor = (rul) => {
        if (rul > 70) return 'dtw-metric-value-white';
        if (rul > 30) return 'text-yellow-400';
        return 'text-red-400';
    };

    // --- Fault Injection Handlers ---
    const injectFault = (faultType) => {
        if (!isRunning) setIsRunning(true);
        setDegradationLevel(0.2); // Start degradation immediately
        setActiveFault(faultType);
        setAlerts(prev => [...prev.filter(a => a.id !== 'fault-injection'), {
            id: 'fault-injection',
            type: 'warning',
            message: `Simulated Fault Injected: ${faultType.toUpperCase()} - Degradation commencing.`,
            time: currentTime
        }]);
    };
    
    // --- API Fetch Function ---
    const fetchPrediction = useCallback(async (sensorInput) => {
        // Simple exponential backoff retry logic (prevents console spam during disconnects)
        const MAX_RETRIES = 3;
        const initialDelay = 500;
        
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            setIsConnecting(true);
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sensor_reading: sensorInput })
                });

                if (!response.ok) {
                    throw new Error(`API returned status ${response.status}`);
                }

                const payload = await response.json();

                // Support multiple response shapes: { predicted_rul }, { rul }, or { data: { rul, health, anomaly_score } }
                let predictedRUL = null;
                let serverHealth = null;
                let serverAnomaly = null;
                if (payload && typeof payload === 'object') {
                    if (payload.predicted_rul !== undefined) predictedRUL = payload.predicted_rul;
                    else if (payload.rul !== undefined) predictedRUL = payload.rul;
                    else if (payload.data && payload.data.predicted_rul !== undefined) predictedRUL = payload.data.predicted_rul;
                    else if (payload.data && payload.data.rul !== undefined) predictedRUL = payload.data.rul;

                    if (payload.health !== undefined) serverHealth = payload.health;
                    else if (payload.data && payload.data.health !== undefined) serverHealth = payload.data.health;

                    if (payload.anomaly_score !== undefined) serverAnomaly = payload.anomaly_score;
                    else if (payload.data && payload.data.anomaly_score !== undefined) serverAnomaly = payload.data.anomaly_score;
                }

                // Fallbacks: prefer server-provided health/anomaly when available
                // Normalize RUL to cycles so frontend shows cycles consistently.
                // Backend may return RUL in 0-100 (percent). We display cycles with RUL_MAX_CYCLES.
                const RUL_MAX_CYCLES = 200;
                let predictedRULcycles = null;
                if (predictedRUL === null) {
                    // derive from server health if present
                    predictedRULcycles = (typeof serverHealth === 'number') ? Math.round((serverHealth / 100) * RUL_MAX_CYCLES) : rul;
                } else {
                    // If backend returned a numeric RUL, decide whether it's percent (<=100) or cycles (>100)
                    if (typeof predictedRUL === 'number') {
                        predictedRULcycles = predictedRUL > RUL_MAX_CYCLES ? Math.round(predictedRUL) : Math.round((predictedRUL / 100) * RUL_MAX_CYCLES);
                    } else {
                        predictedRULcycles = rul;
                    }
                }
                setRul(predictedRULcycles);

                // 2. Update Alerts from API response (if present)
                const alertMsg = payload && (payload.alert || (payload.data && payload.data.alert));
                if (alertMsg && !alerts.some(a => a.message === alertMsg)) {
                    setAlerts(prevAlerts => [
                        ...prevAlerts, 
                        {
                            id: Date.now(),
                            type: alertMsg.includes('Critical') ? 'critical' : 'warning',
                            message: alertMsg,
                            time: currentTime
                        }
                    ]);
                } else if (!alertMsg && alerts.some(a => a.id === 'api-error')) {
                    // Clear API error if connection is restored
                    setAlerts(prev => prev.filter(a => a.id !== 'api-error'));
                }
                
                // 3. Derive Health & Anomaly Score from RUL (for visualization consistency)
                // Prefer server health/anomaly if provided, otherwise derive from predictedRUL
                let newHealth = null;
                if (typeof serverHealth === 'number') {
                    newHealth = Number(serverHealth);
                } else {
                    const RUL_MAX_CYCLES = 200; 
                    newHealth = Math.max(0, (predictedRUL / RUL_MAX_CYCLES) * 100);
                }
                setSystemHealth(newHealth);

                // Anomaly Score: prefer server value, else inverse of health
                let newAnomalyScore = null;
                if (typeof serverAnomaly === 'number') newAnomalyScore = Number(serverAnomaly);
                else newAnomalyScore = Math.round(100 - newHealth);
                setAnomalyScore(newAnomalyScore);

                setIsConnecting(false);
                // Return computed values so caller can immediately use them
                return { predictedRUL: predictedRULcycles, newHealth, newAnomalyScore };

            } catch (error) {
                if (attempt === 0) {
                    console.error(`Attempt ${attempt + 1}: Error fetching RUL prediction: ${error.message}`);
                }
                if (attempt < MAX_RETRIES - 1) {
                    const delay = initialDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                // Mark server unavailable and add a single API error alert (managed by health checker)
                setIsServerAvailable(false);
                setIsConnecting(false);
                if (!alerts.some(a => a.id === 'api-error')) {
                    setAlerts(prev => [...prev, {
                        id: 'api-error',
                        type: 'critical',
                        message: `API Connection Error: ${error.message}. Is the Python server running?`,
                        time: currentTime
                    }]);
                }
                return null;
            }
        }
    }, [alerts, currentTime]);

    // Ping backend health endpoint every 3s to detect recovery and auto-initialize
    useEffect(() => {
        const HEALTH_URL = 'http://127.0.0.1:5000/api/health';
        const check = async () => {
            try {
                const r = await fetch(HEALTH_URL, { method: 'GET' });
                if (!r.ok) throw new Error(`status ${r.status}`);
                const j = await r.json();
                if (!isServerAvailable) {
                    // server just became available
                    setIsServerAvailable(true);
                    // remove API error alert if present
                    setAlerts(prev => prev.filter(a => a.id !== 'api-error'));
                    // attempt to initialize model on server so /api/simulate works
                    try {
                        await fetch('http://127.0.0.1:5000/api/initialize', { method: 'POST' });
                        console.info('Backend initialized from frontend health check');
                    } catch (e) {
                        console.info('Backend initialize attempt failed:', e.message);
                    }
                }
            } catch (e) {
                // server still down
                setIsServerAvailable(false);
            }
        };
        // initial check
        check();
        healthCheckRef.current = setInterval(check, 3000);
        return () => clearInterval(healthCheckRef.current);
    }, []);


    // --- Simulation and API Call Loop ---
    useEffect(() => {
        if (!isRunning) return;

        // Determine the degradation rate based on the active fault
        let degradationRate = 0.0005; // Default slow degradation
        let baseFeatureInput = 0.5;

        if (activeFault === 'bearing') {
            degradationRate = 0.005; 
            baseFeatureInput = 0.7; // Higher starting point for sensor feature
        } else if (activeFault === 'misalignment') {
            degradationRate = 0.01; 
            baseFeatureInput = 1.0; // Even higher starting point
        }
        
        const APPEND_TICKS = 5; // append to historicalData every 5 ticks (reduce chart render load)
        const interval = setInterval(async () => {
            // increment shared ref and state so we can use the fresh time value immediately
            currentTimeRef.current += 1;
            setCurrentTime(currentTimeRef.current);
            tickCounterRef.current += 1;
            
            // Step 1: Simulate the physical degradation process (0 to 1)
            const newDegradation = Math.min(degradationLevel + degradationRate, 1);
            setDegradationLevel(newDegradation);
            
            // Step 2: Simulate physical sensor readings
            const baseTemp = 25 + Math.random() * 2;
            const degradationTemp = newDegradation * 30 * (activeFault === 'misalignment' ? 1.5 : 1);
            const newTemp = baseTemp + degradationTemp;
            setMotorTemp(newTemp);
            
            const baseVib = 0.5 + Math.random() * 0.3;
            const degradationVib = newDegradation * 3 * (activeFault === 'bearing' ? 1.5 : 1);
            const newVib = baseVib + degradationVib;
            setVibration(newVib);
            
            // Update Frequency Spectrum (depends on activeFault)
            setFrequencySpectrum(generateFrequencyData(newDegradation, activeFault));

            // Step 3: Create the AI Model Input Feature
            // This feature is the main input for the RUL prediction in the Flask backend
            const sensorInput = baseFeatureInput + newDegradation * 1.0; 

            // Step 4: Call the backend API for RUL Prediction and capture results
            const predictionResult = await fetchPrediction(sensorInput);

            // Use returned values when available; otherwise compute a local fallback from degradation
            const RUL_MAX_CYCLES = 200;
            let usedRul;
            let usedHealth;
            let usedAnomaly;
            if (predictionResult && predictionResult.predictedRUL !== undefined) {
                usedRul = predictionResult.predictedRUL;
                usedHealth = predictionResult.newHealth !== undefined ? predictionResult.newHealth : Math.max(0, (usedRul / RUL_MAX_CYCLES) * 100);
                usedAnomaly = predictionResult.newAnomalyScore !== undefined ? predictionResult.newAnomalyScore : Math.round(100 - usedHealth);
            } else {
                // Local fallback: map degradation (0..1) to cycles (RUL decreases as degradation increases)
                usedRul = Math.round((1 - newDegradation) * RUL_MAX_CYCLES);
                usedHealth = Math.max(0, (usedRul / RUL_MAX_CYCLES) * 100);
                usedAnomaly = Math.round(100 - usedHealth);
                // update state so UI metrics remain responsive even without backend
                setRul(usedRul);
                setSystemHealth(usedHealth);
                setAnomalyScore(usedAnomaly);
            }

            // Health alarm checks
            if (usedHealth <= 25 && usedHealth > 0) {
                // Add a one-time critical alert about low health
                if (!alerts.some(a => a.id === 'low-health')) {
                    setAlerts(prev => [...prev, { id: 'low-health', type: 'critical', message: `LOW HEALTH: ${usedHealth.toFixed(1)}% — schedule maintenance`, time: currentTimeRef.current }]);
                    // play short warning beep
                    playBeep(880, 250, 2, 150);
                }
            }

            if (usedHealth <= 0) {
                // Failure: stop the simulation and raise a final alert
                setStoppedDueToFailure(true);
                setIsRunning(false);
                if (!alerts.some(a => a.id === 'failed')) {
                    setAlerts(prev => [...prev, { id: 'failed', type: 'critical', message: `SYSTEM FAILURE: health reached 0%. Readings stopped.`, time: currentTimeRef.current }]);
                }
                // play continuous alarm
                playBeep(220, 800, 6, 100);
                // Do not append further data
                return;
            }

            // Append to historicalData at a slower cadence to keep charts responsive
            if (tickCounterRef.current % APPEND_TICKS === 0) {
                setHistoricalData(prev => {
                    const newData = [...prev, {
                        time: currentTimeRef.current || currentTime,
                        temperature: Number(newTemp),
                        vibration: Number(newVib),
                        anomalyScore: Number(usedAnomaly),
                        rul: Number(usedRul),
                        health: Number(usedHealth)
                    }];
                    return newData.slice(-200);
                });
            }
            
        }, 100); 

        return () => clearInterval(interval);
    }, [isRunning, degradationLevel, currentTime, anomalyScore, rul, systemHealth, activeFault, fetchPrediction]); 

    const resetSimulation = () => {
        setIsRunning(false);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        setSystemHealth(100);
        setRul(200);
        setAnomalyScore(0);
        setMotorTemp(25);
        setVibration(0.5);
        setHistoricalData([]);
        setFrequencySpectrum(generateFrequencyData(0, 'none'));
        setDegradationLevel(0);
        setActiveFault('none');
        setAlerts([]);
        setIsConnecting(false);
        setStoppedDueToFailure(false);
        stopBeep();
    };

    // Stop beep if user pauses or stops simulation manually
    useEffect(() => {
        if (!isRunning) {
            stopBeep();
        }
    }, [isRunning]);

    // Debug: log historicalData changes to help diagnose chart rendering
    useEffect(() => {
        if (historicalData.length > 0) {
            // Log last point and length
            console.debug('historicalData updated, length=', historicalData.length, 'last=', historicalData[historicalData.length - 1]);
        }
    }, [historicalData]);


    // --- Render Component ---
    return (
        <div className="dtw-main-bg">
            <div className="dtw-container">
                {/* Header */}
                <div className="dtw-header">
                    <div className="dtw-header-row">
                        <div>
                            <h1 className="dtw-title">Smart Digital Twin</h1>
                            <p className="dtw-subtitle">AI-Driven Predictive Maintenance Dashboard</p>
                        </div>
                        <div className="dtw-header-btns-group">
                             <div className="dtw-status-indicator">
                                {isConnecting ? (
                                    <span className="dtw-status-text dtw-status-text-loading">Connecting...</span>
                                ) : (
                                    <span className={`dtw-status-text ${isRunning ? 'dtw-status-text-running' : 'dtw-status-text-paused'}`}>
                                        Status: {isRunning ? 'RUNNING' : 'PAUSED'}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setIsRunning(!isRunning)}
                                className={`dtw-btn ${isRunning ? 'dtw-btn-pause' : 'dtw-btn-start'}`}
                                disabled={isConnecting}
                            >
                                {isRunning ? 'Pause' : 'Start'} Simulation
                            </button>
                            <button
                                onClick={resetSimulation}
                                className="dtw-btn dtw-btn-reset"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>

                {/* Fault Injection Row */}
                <div className="dtw-fault-row">
                    <Wrench className="text-red-400" size={24} />
                    <span className="text-white font-semibold mr-4">Fault Injection Controls:</span>
                    <button 
                        onClick={() => injectFault('bearing')} 
                        className={`dtw-fault-btn ${activeFault === 'bearing' ? 'dtw-fault-btn-active-yellow' : 'dtw-fault-btn-yellow'}`}
                        disabled={isRunning && activeFault !== 'none'}
                    >
                        Inject Bearing Fault
                    </button>
                    <button 
                        onClick={() => injectFault('misalignment')} 
                        className={`dtw-fault-btn ${activeFault === 'misalignment' ? 'dtw-fault-btn-active-red' : 'dtw-fault-btn-red'}`}
                        disabled={isRunning && activeFault !== 'none'}
                    >
                        Inject Critical Misalignment
                    </button>
                    {activeFault !== 'none' && (
                        <span className="dtw-active-fault-status ml-4">
                            Active Fault: {activeFault.toUpperCase()} 
                            <RotateCw className="inline ml-2 animate-spin-slow" size={16} />
                        </span>
                    )}
                </div>


                {/* Key Metrics */}
                <div className="dtw-metrics-row">
                    {/* System Health Dial */}
                    <div className="dtw-metric-card dtw-metric-dial">
                        <HealthDial health={systemHealth} />
                        <p className="dtw-metric-label mt-2">Overall System Health</p>
                    </div>

                    <div className="dtw-metric-card dtw-metric-blue">
                        <div className="dtw-metric-top">
                            <TrendingUp className="dtw-metric-icon-blue" size={32} />
                            <span className={`dtw-metric-value ${getRULColor(rul)}`}>
                                {rul.toFixed(0)} cycles
                            </span>
                        </div>
                        <p className="dtw-metric-label dtw-metric-label-blue">{getRULText(rul)}</p>
                    </div>

                    <div className="dtw-metric-card dtw-metric-orange">
                        <div className="dtw-metric-top">
                            <Zap className="dtw-metric-icon-orange" size={32} />
                            <span className="dtw-metric-value dtw-metric-value-white">
                                {motorTemp.toFixed(1)}°C
                            </span>
                        </div>
                        <p className="dtw-metric-label dtw-metric-label-orange">Motor Temperature (Sim)</p>
                    </div>

                    <div className="dtw-metric-card dtw-metric-purple">
                        <div className="dtw-metric-top">
                            <Gauge className="dtw-metric-icon-purple" size={32} />
                            <span className="dtw-metric-value dtw-metric-value-white">
                                {vibration.toFixed(2)} g
                            </span>
                        </div>
                        <p className="dtw-metric-label dtw-metric-label-purple">Vibration Level (Sim)</p>
                    </div>
                </div>

                {/* Charts Container - Enforced Height and Width */}
                <div 
                    className="dtw-charts-row-full" 
                    style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                        gap: '24px', 
                        marginBottom: '24px' 
                    }}
                >
                    
                    {/* CHART 1: RUL & Health (AI Outputs) */}
                    <div className="dtw-chart-card">
                        <h3 className="dtw-chart-title">AI Predicted Health & RUL (Time-Series)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={historicalData} margin={{ top: 10, right: 20, left: 20, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                                <XAxis dataKey="time" stroke="#fff" label={{ value: 'Simulation Time (s)', position: 'bottom', offset: 10, fill: '#93c5fd' }} tick={{ fill: '#fff' }} />
                                <YAxis stroke="#fff" label={{ value: 'Value', angle: -90, position: 'insideLeft', offset: 10, fill: '#93c5fd' }} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                                    labelStyle={{ color: '#fff' }}
                                    formatter={(value, name) => [`${value.toFixed(1)} ${name.includes('Health') ? '%' : 'cycles'}`, name]}
                                />
                                <Legend wrapperStyle={{ color: '#fff' }}/>
                                <Area type="monotone" dataKey="health" stroke="#10b981" fill="#10b98140" strokeWidth={2} name="Health (%)" />
                                <Area type="monotone" dataKey="rul" stroke="#3b82f6" fill="#3b82f640" strokeWidth={2} name="RUL (cycles)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* CHART 2: Motor Temperature Trend (Individual) */}
                    <div className="dtw-chart-card">
                        <h3 className="dtw-chart-title">Motor Temperature Trend</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={historicalData} margin={{ top: 10, right: 20, left: 20, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                                <XAxis dataKey="time" stroke="#fff" label={{ value: 'Time (s)', position: 'insideLeft', offset: 10, fill: '#93c5fd' }} tick={{ fill: '#fff' }} />
                                <YAxis stroke="#fff" label={{ value: '°C', angle: -90, position: 'insideLeft', offset: 10, fill: '#93c5fd' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} labelStyle={{ color: '#fff' }} />
                                <Legend wrapperStyle={{ color: '#fff' }}/>
                                <Line type="monotone" dataKey="temperature" stroke="#fdba74" strokeWidth={2} dot={false} name="Temperature (°C)" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    
                    {/* CHART 3: Vibration Level Trend (Individual) */}
                    <div className="dtw-chart-card">
                        <h3 className="dtw-chart-title">Vibration Level Trend</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={historicalData} margin={{ top: 10, right: 20, left: 20, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                                <XAxis dataKey="time" stroke="#fff" label={{ value: 'Time (s)', position: 'insideLeft', offset: 10, fill: '#93c5fd' }} tick={{ fill: '#fff' }} />
                                <YAxis stroke="#fff" label={{ value: 'g', angle: -90, position: 'insideLeft', offset: 10, fill: '#93c5fd' }}/>
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} labelStyle={{ color: '#fff' }} />
                                <Legend wrapperStyle={{ color: '#fff' }}/>
                                <Line type="monotone" dataKey="vibration" stroke="#a78bfa" strokeWidth={2} dot={false} name="Vibration (g)" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* CHART 4: Frequency Spectrum (Detailed Vibration Analysis) */}
                    <div className="dtw-chart-card">
                        <h3 className="dtw-chart-title">Vibration Frequency Spectrum (Simulated FFT)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={frequencySpectrum} margin={{ top: 10, right: 20, left: 20, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                                <XAxis dataKey="frequency" stroke="#fff" label={{ value: 'Frequency (Hz)', position: 'insideLeft', offset: 10, fill: '#93c5fd' }} tick={{ fill: '#fff' }} />
                                <YAxis stroke="#fff" label={{ value: 'Amplitude', angle: -90, position: 'insideLeft', offset: 10, fill: '#93c5fd' }}/>
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                                    labelStyle={{ color: '#fff' }}
                                    formatter={(value, name, props) => {
                                        if (name === 'Amplitude') {
                                            const fault = props.payload.fault !== 'None' ? ` (${props.payload.fault} Fault)` : '';
                                            return [`${value.toFixed(1)}` + fault, name];
                                        }
                                        return [value, name];
                                    }}
                                />
                                <Legend wrapperStyle={{ color: '#fff' }}/>
                                <Line type="monotone" dataKey="amplitude" stroke="#f59e0b" strokeWidth={3} dot={false} name="" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Anomaly Score and Alerts in a two-column layout */}
                <div className="dtw-bottom-row">
                     {/* Alerts */}
                    {alerts.length > 0 ? (
                        <div className="dtw-alerts-card">
                            <h3 className="dtw-alerts-title">
                                <AlertTriangle className="dtw-alerts-icon" size={24} />
                                Maintenance Alerts (From AI Backend)
                            </h3>
                            <div className="dtw-alerts-list">
                                {alerts.map(alert => (
                                    <div 
                                        key={alert.id}
                                        className={`dtw-alert ${alert.type === 'critical' ? 'dtw-alert-critical' : 'dtw-alert-warning'}`}
                                    >
                                        <div className="dtw-alert-row">
                                            <AlertCircle className={alert.type === 'critical' ? 'dtw-alert-icon-critical' : 'dtw-alert-icon-warning'} size={20} />
                                            <div className="dtw-alert-content">
                                                <p className="dtw-alert-message">{alert.message}</p>
                                                <p className="dtw-alert-time">Time: {alert.time}s</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="dtw-alerts-card dtw-alerts-card-normal">
                             <h3 className="dtw-alerts-title">
                                <ShieldCheck className="dtw-alerts-icon-green" size={24} />
                                Maintenance Alerts (From AI Backend)
                            </h3>
                            <p className="text-gray-400 font-semibold mt-4">No critical or warning alerts detected. System is operating within acceptable RUL thresholds.</p>
                        </div>
                    )}


                    {/* Anomaly Score */}
                    <div className="dtw-anomaly-card">
                        <h3 className="dtw-anomaly-title">AI Anomaly Detection Score (Derived from RUL)</h3>
                        <div className="dtw-anomaly-row">
                            <div className="dtw-anomaly-bar-wrap">
                                <div className="dtw-anomaly-bar-bg">
                                    <div 
                                        className={`dtw-anomaly-bar ${anomalyScore > 70 ? 'dtw-anomaly-bar-red' : anomalyScore > 40 ? 'dtw-anomaly-bar-yellow' : 'dtw-anomaly-bar-green'}`}
                                        style={{ width: `${anomalyScore}%` }}
                                    />
                                </div>
                            </div>
                            <span className={`dtw-anomaly-value ${anomalyScore > 70 ? 'dtw-anomaly-value-red' : anomalyScore > 40 ? 'dtw-anomaly-value-yellow' : 'dtw-anomaly-value-green'}`}>
                                {anomalyScore.toFixed(1)}%
                            </span>
                        </div>
                        <p className="dtw-anomaly-desc">
                            {anomalyScore < 30 && "System operating normally"}
                            {anomalyScore >= 30 && anomalyScore < 70 && "Minor degradation detected by AI model"}
                            {anomalyScore >= 70 && "Critical degradation detected - AI predicts imminent failure"}
                        </p>
                    </div>
                </div>

                {/* System Info */}
                <div className="dtw-arch-card">
                    <h3 className="dtw-arch-title">Digital Twin Architecture</h3>
                    <div className="dtw-arch-row">
                        <div className="dtw-arch-block dtw-arch-block-blue">
                            <p className="dtw-arch-block-title dtw-arch-block-title-blue">Data Layer (Simulated)</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-blue">• Temperature, Vibration, Frequency (FFT)</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-blue">• Degradation mapped to AI input feature</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-blue">• Continuous data stream</p>
                        </div>
                        <div className="dtw-arch-block dtw-arch-block-purple">
                            <p className="dtw-arch-block-title dtw-arch-block-title-purple">AI/ML Layer (Flask Backend)</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-purple">• Linear Regression RUL Model</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-purple">• REST API for prediction/alerting</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-purple">• Condition Monitoring Logic</p>
                        </div>
                        <div className="dtw-arch-block dtw-arch-block-green">
                            <p className="dtw-arch-block-title dtw-arch-block-title-green">Frontend (Visualization)</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-green">• **All 4 Time-Series Charts**</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-green">• Real-time RUL and Alert display</p>
                            <p className="dtw-arch-block-desc dtw-arch-block-desc-green">• Responsive dashboard</p>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Embedded CSS for reliable styling */}
            <style jsx>{`
                .dtw-main-bg {
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0f172a 100%);
                    padding: 24px;
                    font-family: 'Inter', sans-serif;
                }
                .dtw-container {
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .dtw-header {
                    background: rgba(255,255,255,0.08);
                    border-radius: 20px;
                    padding: 24px;
                    margin-bottom: 16px;
                    border: 1px solid rgba(255,255,255,0.12);
                    backdrop-filter: blur(8px);
                }
                .dtw-header-row {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                }
                .dtw-title {
                    font-size: 2.5rem;
                    font-weight: bold;
                    color: #fff;
                    margin-bottom: 8px;
                }
                .dtw-subtitle {
                    color: #93c5fd;
                }
                .dtw-header-btns-group {
                    display: flex;
                    gap: 16px;
                    align-items: center;
                }
                .dtw-btn {
                    padding: 12px 24px;
                    border-radius: 14px;
                    font-weight: 600;
                    font-size: 1rem;
                    border: none;
                    cursor: pointer;
                    transition: background 0.2s;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
                }
                .dtw-btn-start { background: #22c55e; color: #fff; }
                .dtw-btn-start:hover { background: #16a34a; }
                .dtw-btn-pause { background: #ef4444; color: #fff; }
                .dtw-btn-pause:hover { background: #b91c1c; }
                .dtw-btn-reset { background: #3b82f6; color: #fff; }
                .dtw-btn-reset:hover { background: #1d4ed8; }

                .dtw-status-indicator {
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: #d1d5db;
                    padding: 8px 12px;
                    border-radius: 8px;
                    background: rgba(255,255,255,0.1);
                }
                .dtw-status-text-running { color: #22c55e; }
                .dtw-status-text-paused { color: #eab308; }
                .dtw-status-text-loading { color: #60a5fa; }

                /* --- Fault Injection Styles --- */
                .dtw-fault-row {
                    background: rgba(251, 191, 36, 0.15);
                    border-radius: 20px;
                    padding: 12px 24px;
                    margin-bottom: 24px;
                    border: 1px solid #fde047;
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 12px;
                }
                .dtw-fault-btn {
                    padding: 8px 16px;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    border: none;
                    cursor: pointer;
                    transition: background 0.2s, opacity 0.2s;
                }
                .dtw-fault-btn:disabled { opacity: 0.6; cursor: not-allowed; }
                .dtw-fault-btn-yellow { background: #fde047; color: #1f2937; }
                .dtw-fault-btn-yellow:hover { background: #facc15; }
                .dtw-fault-btn-active-yellow { background: #facc15; color: #1f2937; border: 2px solid #fff; }
                .dtw-fault-btn-red { background: #f87171; color: #fff; }
                .dtw-fault-btn-red:hover { background: #ef4444; }
                .dtw-fault-btn-active-red { background: #ef4444; color: #fff; border: 2px solid #fff; }
                .dtw-active-fault-status { color: #fde047; font-style: italic; font-size: 0.9rem; }
                
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow { animation: spin-slow 4s linear infinite; }

                /* --- Metrics Row Styles --- */
                .dtw-metrics-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 24px;
                    margin-bottom: 24px;
                }
                @media (min-width: 768px) {
                    .dtw-metrics-row { grid-template-columns: repeat(4, 1fr); }
                }
                @media (min-width: 1024px) {
                    .dtw-metrics-row { grid-template-columns: 1fr 1fr 1fr 1fr; }
                }
                .dtw-metric-card {
                    border-radius: 20px;
                    padding: 24px;
                    backdrop-filter: blur(8px);
                    border: 2px solid #e5e7eb;
                    background: rgba(255,255,255,0.08);
                    box-shadow: 0 10px 15px rgba(0,0,0,0.1);
                }
                .dtw-metric-dial {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    text-align: center;
                }
                .dtw-metric-blue { border-color: #60a5fa; background: rgba(59,130,246,0.08); }
                .dtw-metric-orange { border-color: #fdba74; background: rgba(251,146,60,0.08); }
                .dtw-metric-purple { border-color: #c4b5fd; background: rgba(168,85,247,0.08); }
                .dtw-metric-top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .dtw-metric-value { font-size: 2rem; font-weight: bold; }
                .dtw-metric-value-white { color: #fff; }
                .dtw-metric-label-blue { color: #93c5fd; }
                .dtw-metric-label-orange { color: #fdba74; }
                .dtw-metric-label-purple { color: #c4b5fd; }
                .dtw-metric-icon-blue { color: #60a5fa; }
                .dtw-metric-icon-orange { color: #fdba74; }
                .dtw-metric-icon-purple { color: #c4b5fd; }
                .text-yellow-400 { color: #facc15; }
                .text-red-400 { color: #f87171; }
                .stroke-green-500 { stroke: #10b981; }
                .stroke-yellow-500 { stroke: #eab308; }
                .stroke-red-500 { stroke: #ef4444; }


                /* --- Chart Row Styles --- */
                .dtw-charts-row-full {
                    /* Style set using inline React style above for guaranteed rendering */
                }

                .dtw-chart-card {
                    background: rgba(255,255,255,0.08);
                    border-radius: 20px;
                    padding: 24px;
                    border: 1px solid rgba(255,255,255,0.12);
                    backdrop-filter: blur(8px);
                    box-shadow: 0 10px 15px rgba(0,0,0,0.1);
                    min-height: 350px; 
                }
                .dtw-chart-title { font-size: 1.25rem; font-weight: bold; color: #fff; margin-bottom: 16px; }

                /* --- Bottom Row Styles (Alerts & Anomaly) --- */
                .dtw-bottom-row {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                    margin-bottom: 24px;
                }
                @media (min-width: 768px) {
                    .dtw-bottom-row { grid-template-columns: 1fr 1fr; }
                }

                .dtw-anomaly-card {
                    background: rgba(255,255,255,0.08);
                    border-radius: 20px;
                    padding: 24px;
                    border: 1px solid rgba(255,255,255,0.12);
                    backdrop-filter: blur(8px);
                    box-shadow: 0 10px 15px rgba(0,0,0,0.1);
                }
                .dtw-anomaly-title { font-size: 1.25rem; font-weight: bold; color: #fff; margin-bottom: 16px; }
                .dtw-anomaly-row { display: flex; align-items: center; gap: 16px; }
                .dtw-anomaly-bar-wrap { flex: 1; }
                .dtw-anomaly-bar-bg {
                    height: 32px;
                    background: #374151;
                    border-radius: 999px;
                    overflow: hidden;
                }
                .dtw-anomaly-bar { height: 100%; transition: width 0.5s, background-color 0.5s; }
                .dtw-anomaly-bar-green { background: #22c55e; }
                .dtw-anomaly-bar-yellow { background: #eab308; }
                .dtw-anomaly-bar-red { background: #ef4444; }
                .dtw-anomaly-value { font-size: 1.5rem; font-weight: bold; }
                .dtw-anomaly-value-green { color: #22c55e; }
                .dtw-anomaly-value-yellow { color: #eab308; }
                .dtw-anomaly-value-red { color: #ef4444; }
                .dtw-anomaly-desc { color: #93c5fd; margin-top: 8px; font-size: 0.95rem; }

                .dtw-alerts-card {
                    background: rgba(255,255,255,0.08);
                    border-radius: 20px;
                    padding: 24px;
                    border: 1px solid rgba(255,255,255,0.12);
                    backdrop-filter: blur(8px);
                    box-shadow: 0 10px 15px rgba(0,0,0,0.1);
                    min-height: 200px; 
                }
                .dtw-alerts-card-normal {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .dtw-alerts-title {
                    font-size: 1.25rem;
                    font-weight: bold;
                    color: #fff;
                    margin-bottom: 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .dtw-alerts-icon { color: #fde68a; }
                .dtw-alerts-icon-green { color: #22c55e; }
                .dtw-alerts-list { display: flex; flex-direction: column; gap: 12px; max-height: 150px; overflow-y: auto;}
                .dtw-alert {
                    padding: 16px;
                    border-radius: 14px;
                    display: flex;
                    flex-direction: column;
                    border: 1px solid #fde68a;
                    background: rgba(253,230,138,0.2);
                }
                .dtw-alert-critical {
                    border-color: #ef4444;
                    background: rgba(239,68,68,0.2);
                }
                .dtw-alert-row {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }
                .dtw-alert-icon-critical { color: #ef4444; }
                .dtw-alert-icon-warning { color: #fde68a; }
                .dtw-alert-content { flex: 1; }
                .dtw-alert-message { color: #fff; font-weight: 600; }
                .dtw-alert-time { color: #d1d5db; font-size: 0.95rem; }

                .dtw-arch-card {
                    background: rgba(255,255,255,0.08);
                    border-radius: 20px;
                    padding: 24px;
                    border: 1px solid rgba(255,255,255,0.12);
                    margin-top: 24px;
                    backdrop-filter: blur(8px);
                    box-shadow: 0 10px 15px rgba(0,0,0,0.1);
                }
                .dtw-arch-title { font-size: 1.25rem; font-weight: bold; color: #fff; margin-bottom: 16px; }
                .dtw-arch-row {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 16px;
                    font-size: 0.98rem;
                }
                @media (min-width: 768px) {
                    .dtw-arch-row { grid-template-columns: 1fr 1fr 1fr; }
                }
                .dtw-arch-block {
                    border-radius: 14px;
                    padding: 16px;
                    border: 1px solid #60a5fa;
                    background: rgba(59,130,246,0.12);
                }
                .dtw-arch-block-blue { border-color: #60a5fa; background: rgba(59,130,246,0.12); }
                .dtw-arch-block-purple { border-color: #a78bfa; background: rgba(168,85,247,0.12); }
                .dtw-arch-block-green { border-color: #6ee7b7; background: rgba(34,197,94,0.12); }
                .dtw-arch-block-title { font-weight: bold; margin-bottom: 8px; }
                .dtw-arch-block-title-blue { color: #60a5fa; }
                .dtw-arch-block-title-purple { color: #a78bfa; }
                .dtw-arch-block-title-green { color: #6ee7b7; }
                .dtw-arch-block-desc-blue { color: #93c5fd; }
                .dtw-arch-block-desc-purple { color: #c4b5fd; }
                .dtw-arch-block-desc-green { color: #bbf7d0; }
            `}</style>
        </div>
    );
};

export default DigitalTwinDashboard;
