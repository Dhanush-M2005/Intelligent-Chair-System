from flask import Flask, request, jsonify, send_file, url_for, send_from_directory
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_socketio import SocketIO
from pymongo import MongoClient
import os
import re
from werkzeug.utils import secure_filename
import joblib
import numpy as np
from collections import Counter
from datetime import datetime, timedelta
from plyer import notification
from apscheduler.schedulers.background import BackgroundScheduler
import atexit
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table
from reportlab.lib.enums import TA_CENTER
from reportlab.lib import colors
import logging

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://127.0.0.1:5500"}}, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*")

# Load trained SVM model and Scaler
svm_model = joblib.load("C:\\Users\\dhanu\\Downloads\\deep\\svm_posture_model.pkl")
scaler = joblib.load("C:\\Users\\dhanu\\Downloads\\deep\\scaler.pkl")

bcrypt = Bcrypt(app)

# MongoDB Configuration
MONGO_URI = "mongodb+srv://manikandanoficial06:dhanush2005@cluster0.0itok.mongodb.net/"
client = MongoClient(MONGO_URI)
db = client['login']
users_collection = db['users']
contacts_collection = db['contacts']
sensor_readings = db["sensor_readings"]

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
app.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Global variables
prolonged_threshold = 7200  # 2 hours in seconds
check_interval = 300        # 5 minutes in seconds
alert_cooldown = 7200       # 2 hours cooldown
lis = []                    # Logged-in users tracker
posture_buffer = []
scheduler = BackgroundScheduler()

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# =================== POSTURE MONITORING SYSTEM ===================
def analyze_posture():
    global posture_buffer
    try:
        if lis and len(lis) >= 2:
            check_sitting_duration()
    finally:
        posture_buffer = []  # Reset buffer after each analysis

def check_sitting_duration():
    if not lis or len(lis) < 2:
        return

    user_email = lis[1]
    
    # Check for continuous sitting in buffer
    if len(posture_buffer) > 0 and all(posture != "Absent" for posture in posture_buffer):
        # Get last alert time
        last_alert = sensor_readings.find_one(
            {"user_email": user_email, "alert_type": "prolonged_sitting"},
            sort=[("timestamp", -1)]
        )
        
        # Calculate time since last alert
        alert_gap = alert_cooldown
        if last_alert:
            time_since_last = datetime.now() - last_alert['timestamp']
            alert_gap = time_since_last.total_seconds()

        # Trigger alert if cooldown has expired
        if alert_gap >= alert_cooldown:
            trigger_alert(
                "Prolonged Sitting Alert!",
                "You've been sitting for over 2 hours. Time to take a break!",
                "prolonged_sitting"
            )

def trigger_alert(title, message, alert_type):
    if not lis or len(lis) < 2:
        return

    user_email = lis[1]
    
    alert_data = {
        "user_email": user_email,
        "type": "alert",
        "alert_type": alert_type,
        "message": message,
        "timestamp": datetime.now()
    }
    sensor_readings.insert_one(alert_data)
    
    socketio.emit('posture_alert', {
        "title": title,
        "message": message,
        "timestamp": datetime.now().isoformat()
    })
    
    try:
        notification.notify(
            title=title,
            message=message,
            timeout=100
        )
    except Exception as e:
        print(f"Notification failed: {str(e)}")

# =================== ANALYTICS ENDPOINTS ===================
@app.route('/get_analytics_data', methods=['GET'])
def get_analytics_data():
    try:
        if not lis or len(lis) < 2:
            return jsonify({"error": "Unauthorized"}), 401

        user_email = lis[1]
        date_str = request.args.get('date')
        
        if not date_str:
            return jsonify({"error": "Date parameter required"}), 400

        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        next_day = target_date + timedelta(days=1)

        # Get posture data filtered by date
        posture_data = list(sensor_readings.find({
            "user_email": user_email,
            "type": "posture_raw",
            "timestamp": {
                "$gte": target_date,
                "$lt": next_day
            }
        }))

        # Calculate sitting/non-sitting time
        sitting_intervals = [entry for entry in posture_data if entry["value"] != "Absent"]
        non_sitting_intervals = [entry for entry in posture_data if entry["value"] == "Absent"]

        total_sitting_seconds = len(sitting_intervals) * 300
        total_non_sitting_seconds = len(non_sitting_intervals) * 300

        total_sitting_hours = round(total_sitting_seconds / 3600, 1)
        total_non_sitting_hours = round(total_non_sitting_seconds / 3600, 1)

        # Posture distribution
        posture_counts = Counter([entry["value"] for entry in sitting_intervals])

        return jsonify({
            "total_sitting_time": total_sitting_hours,
            "total_non_sitting_time": total_non_sitting_hours,
            "posture_distribution": dict(posture_counts),
            "chart_data": {
                "labels": ["Sitting", "Non-Sitting"],
                "data": [total_sitting_hours, total_non_sitting_hours]
            }
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =================== REAL-TIME SENSOR HANDLING ===================
@app.route('/sensor_data', methods=['POST'])
def handle_sensor_data():
    if not lis or len(lis) < 2:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    user_email = lis[1]

    if 'sensor1' in data:
        try:
            sensor_value = data['sensor1']
            
            # Determine posture based on sensor threshold
            if sensor_value < 5000:
                posture = "Absent"
            else:
                # Process with ML model if above threshold
                readings = [[sensor_value]]
                X_test_scaled = scaler.transform(readings)
                y_pred = svm_model.predict(X_test_scaled)
                posture = y_pred[0]

            # Record all postures (including "Absent")
            posture_buffer.append(posture)
            sensor_readings.insert_one({
                "user_email": user_email,
                "type": "posture_raw",
                "value": posture,
                "timestamp": datetime.now()
            })
            
            socketio.emit('posture_update', {
                "position": posture,
                "timestamp": datetime.now().isoformat()
            })

            return jsonify({"posture": posture}), 200
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    return jsonify({"error": "Invalid sensor data format"}), 400

# =================== SCHEDULER SETUP ===================
scheduler.add_job(func=analyze_posture, trigger="interval", seconds=check_interval)
scheduler.start()
atexit.register(lambda: scheduler.shutdown())

# =================== AUTHENTICATION ROUTES ===================
@app.route("/signup", methods=["POST"])
def signup():
    data = request.json
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    existing_user = users_collection.find_one({"username": username})
    if existing_user:
        if bcrypt.check_password_hash(existing_user["password"], password):
            return jsonify({"error": "Username and password both are taken"}), 400

    if users_collection.find_one({"email": email}):
        return jsonify({"error": "User already exists!"}), 400

    lis.clear()
    lis.append(username)
    lis.append(email)

    hashed_password = bcrypt.generate_password_hash(password).decode("utf-8")
    users_collection.insert_one({
        "username": username, "email": email, "password": hashed_password, "profile_complete": False
    })

    return jsonify({"message": "Signup successful!", "redirect": "/profile"}), 200

@app.route("/profile", methods=["POST"])
def profile():
    try:
        name = request.form.get("name")
        gender = request.form.get("gender")
        height = request.form.get("height")
        weight = request.form.get("weight")
        bmi = request.form.get("bmi")
        bmiStatus = request.form.get("bmiStatus")
        medical_conditions = request.form.getlist("medicalCondition")
        working_hours = request.form.get("hours")
        profile_photo = request.files.get("profilePhoto")

        if not name or not gender or not height or not weight or not working_hours:
            return jsonify({"error": "All fields are required!"}), 400

        if not lis or len(lis) < 2:
            return jsonify({"error": "User not identified. Please login again."}), 400

        user_email = lis[1]
        photo_url = ""

        if profile_photo:
            if profile_photo.filename == '':
                return jsonify({"error": "No selected file"}), 400
            if not allowed_file(profile_photo.filename):
                return jsonify({"error": "Invalid file type. Only images allowed"}), 400
            
            filename = secure_filename(profile_photo.filename)
            upload_dir = os.path.join("static", "uploads")
            os.makedirs(upload_dir, exist_ok=True)
            photo_path = os.path.join(upload_dir, filename)
            profile_photo.save(photo_path)
            photo_url = f"uploads/{filename}"

        users_collection.update_one(
            {"email": user_email},
            {"$set": {
                "name": name, "gender": gender, "height": height, "weight": weight,
                "bmi": bmi, "bmiStatus": bmiStatus, "medical_conditions": medical_conditions,
                "working_hours": working_hours, "profile_complete": True, "profile_photo": photo_url
            }}
        )

        return jsonify({
            "message": "Profile saved successfully!", 
            "redirect": url_for('serve_login')
        }), 200

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": "Internal Server Error"}), 500

@app.route("/login.html")
def serve_login():
    return send_from_directory('static', 'login.html')

@app.route("/signin", methods=["POST"])
def signin():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    user = users_collection.find_one({"username": username})
    if not user or not bcrypt.check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    lis.clear()
    lis.append(user["username"])
    lis.append(user["email"])

    return jsonify({"message": "Login successful", "username": username}), 200

@app.route("/home")
def home():
    if not lis:
        return jsonify({"error": "User not logged in!"}), 401
    return jsonify({"message": "Welcome to Home Page!", "username": lis[0]})

@app.route("/get_user_profile", methods=["GET"])
def get_user_profile():
    if not lis or len(lis) < 1:
        return jsonify({"error": "User not identified. Please login again."}), 400

    user = users_collection.find_one({"username": lis[0]}, {"_id": 0, "password": 0})
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.get("profile_photo"):
        user["profile_photo"] = user["profile_photo"].replace("\\", "/")

    return jsonify(user), 200

@app.route("/update_profile", methods=["POST"])
def update_profile():
    try:
        if not lis or len(lis) < 2:
            return jsonify({"error": "User not authenticated"}), 401

        user_email = lis[1]
        update_data = {}

        update_data.update({
            "name": request.form.get("name"),
            "gender": request.form.get("gender"),
            "height": request.form.get("height"),
            "weight": request.form.get("weight"),
            "medical_conditions": request.form.getlist("medicalCondition"),
            "working_hours": request.form.get("working_hours"),
            "bmi": request.form.get("bmi"),
            "bmiStatus": request.form.get("bmiStatus")
        })

        update_data = {k: v for k, v in update_data.items() if v not in [None, '', []]}

        if 'profilePhoto' in request.files:
            file = request.files['profilePhoto']
            if file.filename != '':
                if not allowed_file(file.filename):
                    return jsonify({"error": "Invalid file type"}), 400

                filename = secure_filename(file.filename)
                file_path = os.path.join('static/uploads', filename)
                file.save(file_path)
                update_data["profile_photo"] = f"uploads/{filename}"

        users_collection.update_one({"email": user_email}, {"$set": update_data})

        return jsonify({"message": "Profile updated successfully!", "redirect": "/dashboard"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/update_profile_picture", methods=["POST"])
def update_profile_picture():
    try:
        username = request.form.get("username")
        profile_photo = request.files.get("profilePhoto")
        if not profile_photo or not allowed_file(profile_photo.filename):
            return jsonify({"error": "Invalid file type"}), 400
        filename = secure_filename(profile_photo.filename)
        upload_dir = os.path.join("static", "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        profile_photo.save(os.path.join(upload_dir, filename))
        users_collection.update_one({"username": username}, {"$set": {"profile_photo": f"uploads/{filename}"}})
        return jsonify({"message": "Profile picture updated!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/update_email", methods=["POST"])
def update_email():
    try:
        if not lis or len(lis) < 2:
            return jsonify({"error": "User not authenticated"}), 401
            
        data = request.json
        current_email = data.get("currentEmail")
        new_email = data.get("newEmail")
        user_email = lis[1]

        if current_email != user_email:
            return jsonify({"error": "Current email does not match"}), 400

        if users_collection.find_one({"email": new_email}):
            return jsonify({"error": "Email already in use"}), 400

        users_collection.update_one(
            {"email": user_email},
            {"$set": {"email": new_email}}
        )
        lis[1] = new_email
        return jsonify({"message": "Email updated successfully!"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/update_password", methods=["POST"])
def update_password():
    try:
        if not lis or len(lis) < 1:
            return jsonify({"error": "User not authenticated"}), 401

        data = request.json
        current_password = data.get("currentPassword")
        new_password = data.get("newPassword")
        username = lis[0]

        password_regex = r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$"
        if not re.match(password_regex, new_password):
            return jsonify({
                "error": "Password must contain: 8+ characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character (@$!%*?&)"
            }), 400

        user = users_collection.find_one({"username": username})
        if not user:
            return jsonify({"error": "User not found"}), 404

        if not bcrypt.check_password_hash(user["password"], current_password):
            return jsonify({"error": "Incorrect current password"}), 401

        hashed_password = bcrypt.generate_password_hash(new_password).decode("utf-8")
        users_collection.update_one(
            {"username": username},
            {"$set": {"password": hashed_password}}
        )
        return jsonify({"message": "Password updated successfully!"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/submit_contact", methods=["POST"])
def submit_contact():
    try:
        data = request.json
        name = data.get("name")
        email = data.get("email")
        message = data.get("message")

        if not name or not email or not message:
            return jsonify({"error": "All fields are required!"}), 400

        contacts_collection.insert_one({"name": name, "email": email, "message": message})

        return jsonify({"message": f"Thank you, {name}! We will get back to you soon."}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_contacts", methods=["GET"])
def get_contacts():
    try:
        contacts = list(contacts_collection.find({}, {"_id": 0}))
        return jsonify({"contacts": contacts}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/download_analytics', methods=['POST'])
def download_analytics():
    try:
        if not lis or len(lis) < 2:
            logger.error("Unauthorized access attempt")
            return jsonify({"error": "Unauthorized"}), 401

        user_email = lis[1]
        logger.info(f"Generating report for {user_email}")
        
        # Create PDF buffer
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        
        # Custom styles
        styles.add(ParagraphStyle(
            name='Title',
            fontSize=18,
            alignment=TA_CENTER,
            spaceAfter=20,
            fontName='Helvetica-Bold'
        ))
        
        elements = []

        def add_analytics_page(timeframe, start_date, end_date):
            try:
                # Query data with error handling
                posture_data = list(sensor_readings.find({
                    "user_email": user_email,
                    "type": "posture_raw",
                    "timestamp": {"$gte": start_date, "$lt": end_date}
                }).sort("timestamp", 1))

                if not posture_data:
                    elements.append(Paragraph(f"No data available for {timeframe}", styles['Title']))
                    elements.append(PageBreak())
                    return

                # Calculate metrics
                total_records = len(posture_data)
                sitting_hours = len([p for p in posture_data if p['value'] != "Absent"]) * 300 / 3600
                non_sitting_hours = len([p for p in posture_data if p['value'] == "Absent"]) * 300 / 3600
                posture_distribution = Counter([p['value'] for p in posture_data if p['value'] != "Absent"])

                # Create content
                elements.append(Paragraph(f"{timeframe} Analytics", styles['Title']))
                elements.append(Spacer(1, 20))
                
                # Summary table
                summary_data = [
                    ['Metric', 'Value'],
                    ['Total Records', total_records],
                    ['Sitting Hours', f"{sitting_hours:.1f} hrs"],
                    ['Non-Sitting Hours', f"{non_sitting_hours:.1f} hrs"]
                ]
                
                # ... [Keep table creation code] ...

            except Exception as e:
                logger.error(f"Error in {timeframe} page: {str(e)}")
                elements.append(Paragraph(f"Error generating {timeframe} data", styles['Title']))
                elements.append(PageBreak())

        try:
            # Date ranges with validation
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            timeframes = [
                ('Daily', today_start, now),
                ('Weekly', today_start - timedelta(days=7), now),
                ('Monthly', today_start - timedelta(days=30), now),
                ('Yearly', today_start - timedelta(days=365), now)
            ]
            
            for timeframe, start, end in timeframes:
                if start > end:
                    start, end = end, start
                add_analytics_page(timeframe, start, end)

            # Build PDF
            doc.build(elements)
            buffer.seek(0)
            
            logger.info(f"Successfully generated report for {user_email}")
            return send_file(
                buffer,
                as_attachment=True,
                download_name="posture_analytics_report.pdf",
                mimetype="application/pdf"
            )

        except Exception as e:
            logger.error(f"PDF generation failed: {str(e)}")
            return jsonify({"error": f"Report generation failed: {str(e)}"}), 500

    except Exception as e:
        logger.critical(f"Critical error in download_analytics: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

# =================== RUN APPLICATION ===================
if __name__ == '__main__':
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)