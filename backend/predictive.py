import pandas as pd
import numpy as np
import pickle
from sklearn.linear_model import LinearRegression
from flask import Flask, request, jsonify
from flask_cors import CORS # Required to connect to a frontend in a different domain

# --- Configuration ---
MODEL_PATH = 'rul_prediction_model.pkl'
RUL_MAX = 200 # Maximum RUL in cycles, defining the start of life

# --- 1. Synthetic Dataset Generation (Simulating Sensor Data & Degradation) ---

def generate_synthetic_data(num_units=100, max_cycles=RUL_MAX):
    """
    Creates a synthetic dataset mimicking degradation data for RUL prediction.
    This simulates the data acquisition phase mentioned in the project plan.
    """
    data_list = []
    for unit_id in range(1, num_units + 1):
        # Generate data for a single unit
        cycles = np.arange(1, max_cycles + 1)
        
        # Calculate Remaining Useful Life (RUL = max_cycles - current_cycle)
        rul = max_cycles - cycles
        
        # Simulate a degradation feature (e.g., vibration amplitude, temp variance)
        # This feature increases as RUL decreases (i.e., as the unit ages).
        # We add some noise to make it realistic.
        degradation_feature = 0.5 + 0.005 * cycles + np.random.normal(0, 0.1, max_cycles)
        
        # Combine into a DataFrame
        unit_data = pd.DataFrame({
            'unit_id': unit_id,
            'cycle': cycles,
            'feature_degradation': degradation_feature,
            'RUL': rul
        })
        data_list.append(unit_data)
        
    df = pd.concat(data_list, ignore_index=True)
    print(f"Synthetic dataset generated with {len(df)} records.")
    return df

# --- 2. AI Model Training (RUL Estimation) ---

def train_and_save_model(df):
    """
    Trains a simple Linear Regression model to predict RUL based on the
    simulated degradation feature. This is the core AI/ML step.
    """
    # Define features (X) and target (y)
    # The 'feature_degradation' here represents the result of signal processing
    # or Reduced Order Modelling (ROM) from the physical sensor data.
    X = df[['feature_degradation']]
    y = df['RUL']
    
    # Initialize and train the Linear Regression model
    model = LinearRegression()
    model.fit(X, y)
    
    # Save the trained model to disk
    with open(MODEL_PATH, 'wb') as file:
        pickle.dump(model, file)
        
    print(f"Model trained and saved to {MODEL_PATH}")
    return model

# --- 3. Flask API Setup ---

app = Flask(__name__)
# Enable CORS to allow the frontend (running on a different port) to access the API
CORS(app)

# Load the model when the application starts
try:
    with open(MODEL_PATH, 'rb') as file:
        model = pickle.load(file)
except FileNotFoundError:
    # If model doesn't exist, generate data and train it
    print("Model not found. Generating synthetic data and training...")
    synthetic_data = generate_synthetic_data()
    model = train_and_save_model(synthetic_data)
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

@app.route('/predict', methods=['POST'])
def predict_rul():
    """
    API endpoint to receive new sensor data and return a RUL prediction.
    The frontend will call this endpoint with real-time data.
    """
    if not model:
        return jsonify({'error': 'AI Model not initialized or loaded.'}), 500

    try:
        # Expecting JSON data like: {"sensor_reading": 1.25}
        data = request.get_json()
        
        if 'sensor_reading' not in data:
            return jsonify({'error': 'Missing sensor_reading field.'}), 400
            
        # The sensor reading is the input feature for our trained model
        # The model expects a 2D array: [[feature_value]]
        new_feature = np.array([[data['sensor_reading']]])
        
        # Make the prediction
        predicted_rul = model.predict(new_feature)[0]
        
        # Clip the RUL to prevent negative or overly large values
        # RUL must be positive and not exceed the max design life
        predicted_rul = max(0, min(predicted_rul, RUL_MAX))

        # Format the response
        response = {
            'input_feature': data['sensor_reading'],
            'predicted_rul': round(predicted_rul, 2),
            'rul_units': 'cycles',
            'status': 'OK'
        }
        
        # Apply a simple condition monitoring rule:
        if predicted_rul < 30:
            response['alert'] = 'Critical: Remaining Useful Life is Low. Schedule Maintenance Immediately.'
        elif predicted_rul < 70:
            response['alert'] = 'Warning: Degradation Detected. Monitor closely.'

        return jsonify(response)

    except Exception as e:
        # Error handling for bad input or internal issues
        return jsonify({'error': f'An error occurred during prediction: {str(e)}'}), 500

# --- Compatibility endpoints for frontend expecting /api/... routes ---


@app.route('/api/health', methods=['GET'])
def api_health():
    """Compatibility health endpoint used by the React frontend."""
    return jsonify({'status': 'ok', 'model_loaded': model is not None}), 200


@app.route('/api/initialize', methods=['POST'])
def api_initialize():
    """Allow the frontend to request model initialization/training.
    If a model is already loaded this will be a no-op and return OK.
    """
    global model
    try:
        if model is not None:
            return jsonify({'status': 'already_initialized'}), 200
        # Train a fresh model from synthetic data
        df = generate_synthetic_data()
        model = train_and_save_model(df)
        return jsonify({'status': 'initialized'}), 200
    except Exception as e:
        return jsonify({'error': f'Initialization failed: {str(e)}'}), 500


@app.route('/api/simulate', methods=['POST'])
def api_simulate():
    """Compatibility simulate endpoint that mirrors /predict but returns
    both top-level and nested `data` fields which the frontend expects.
    """
    global model
    if not model:
        return jsonify({'error': 'AI Model not initialized or loaded.'}), 500

    try:
        data = request.get_json() or {}
        # If no sensor provided, sample a mid-life reading
        sensor_value = data.get('sensor_reading', 0.6)
        new_feature = np.array([[sensor_value]])
        predicted_rul = model.predict(new_feature)[0]
        predicted_rul = max(0, min(predicted_rul, RUL_MAX))

        # Derive health and anomaly score for frontend consumption
        health = round((predicted_rul / RUL_MAX) * 100, 2)
        anomaly_score = round(max(0, 100 - health), 2)

        resp = {
            'status': 'success',
            'predicted_rul': round(predicted_rul, 2),
            'rul': round(predicted_rul, 2),
            'health': health,
            'anomaly_score': anomaly_score,
            'data': {
                'rul': round(predicted_rul, 2),
                'health': health,
                'anomaly_score': anomaly_score
            }
        }

        # Add a short textual alert when RUL is low (keeps parity with /predict)
        if predicted_rul < 30:
            resp['alert'] = 'Critical: Remaining Useful Life is Low. Schedule Maintenance Immediately.'
        elif predicted_rul < 70:
            resp['alert'] = 'Warning: Degradation Detected. Monitor closely.'

        return jsonify(resp)

    except Exception as e:
        return jsonify({'error': f'An error occurred during simulate: {str(e)}'}), 500


# --- 4. Main Execution ---

if __name__ == '__main__':
    print("\n--- Digital Twin Backend Initialized ---")
    print(f"To test: POST JSON to http://127.0.0.1:5000/predict with 'sensor_reading'.")
    print("Example: {'sensor_reading': 0.6} (Early Life), {'sensor_reading': 1.6} (End of Life)")
    # We will run this in debug mode, which allows for auto-reloading
    app.run(debug=True)
