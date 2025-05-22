// =================== SIDEBAR TOGGLE ===================
const sideMenu = document.querySelector("aside");
const menuBtn = document.querySelector("#menu_bar");
const closeBtn = document.querySelector("#close_btn");

menuBtn.addEventListener("click", () => {
    sideMenu.classList.add("show");
});

closeBtn.addEventListener("click", () => {
    sideMenu.classList.remove("show");
});

// =================== THEME TOGGLER ===================
const themeTogglers = document.querySelectorAll('.theme-toggler');

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme-variables');
        themeTogglers.forEach(toggler => {
            toggler.querySelector('span:nth-child(1)').classList.remove('active');
            toggler.querySelector('span:nth-child(2)').classList.add('active');
        });
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme-variables');
    const isDarkMode = document.body.classList.contains('dark-theme-variables');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');

    themeTogglers.forEach(toggler => {
        toggler.querySelector('span:nth-child(1)').classList.toggle('active');
        toggler.querySelector('span:nth-child(2)').classList.toggle('active');
    });

    destroyCharts();
    createCharts();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    createCharts();
});

themeTogglers.forEach(toggler => {
    toggler.addEventListener('click', toggleTheme);
});

// =================== PROFILE DROPDOWN ===================
const profileBtn = document.querySelector("#profile_img");
const profileDropdown = document.querySelector(".profile-dropdown");

profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle("show");
});

document.addEventListener("click", (event) => {
    if (!profileBtn.contains(event.target) && !profileDropdown.contains(event.target)) {
        profileDropdown.classList.remove("show");
    }
});

// =================== LOGIN CHECK ===================
document.addEventListener("DOMContentLoaded", function () {
    let username = sessionStorage.getItem("username") || localStorage.getItem("username");

    if (!username) {
        window.location.href = "login.html";
    } else {
        document.querySelector("#username_display").textContent = username;
        loadProfilePhoto();
        initializeDatePickers();
    }
});

function handleLogin(username) {
    sessionStorage.setItem("username", username);
    localStorage.setItem("username", username);
}

document.querySelectorAll("#logout_btn").forEach(btn => {
    btn.addEventListener("click", () => {
        sessionStorage.removeItem("username");
        localStorage.removeItem("username");
        window.location.href = "login.html";
    });
});

// =================== DATE PICKER INITIALIZATION ===================
function initializeDatePickers() {
    const dashboardDateInput = document.querySelector("#dashboard .date input");
    const analyticsDateInput = document.querySelector("#analytics .date input");
    
    // Set initial dates
    const today = new Date().toISOString().split("T")[0];
    dashboardDateInput.value = today;
    analyticsDateInput.value = today;

    // Dashboard date handler
    dashboardDateInput.addEventListener('change', () => {
        updateDashboard();
    });

    // Analytics date handler
    analyticsDateInput.addEventListener('change', () => {
        destroyCharts();
        createCharts();
    });
}

// =================== REAL-TIME UPDATES ===================
let socket = io.connect('http://127.0.0.1:5000');

socket.on('posture_update', (data) => {
    document.getElementById("sittingPosition").textContent = data.position || "Unknown";
    updateDashboard();
});

socket.on('posture_alert', (data) => {
    showNotification(data.title, data.message);
});

// =================== UPDATE DASHBOARD DATA ===================
async function updateDashboard() {
    try {
        const dashboardDateInput = document.querySelector("#dashboard .date input");
        const selectedDate = dashboardDateInput.value;

        // Format date as "MMM DD, YYYY" (e.g., "Oct 05, 2023")
        const dateObj = new Date(selectedDate);
        const formattedDate = dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        // Update date display
        document.querySelectorAll("#dashboard .date-label").forEach(element => {
            element.textContent = formattedDate;
        });

        const timeResponse = await fetch(`http://127.0.0.1:5000/get_analytics_data?date=${selectedDate}`);
        const timeData = await timeResponse.json();

        // Update sitting time display
        const totalSittingTime = timeData.total_sitting_time || 0;
        document.querySelector(".sales h1").textContent = `${totalSittingTime} HRS`;

        // Update non-sitting time display
        const totalNonSittingTime = timeData.total_non_sitting_time || 0;
        document.querySelector(".income h1").textContent = `${totalNonSittingTime} HRS`;

    } catch (error) {
        console.error("Dashboard update error:", error);
    }
}

// =================== CHART MANAGEMENT ===================
let sittingTimeChart, postureTrendsChart;

function destroyCharts() {
    if (sittingTimeChart) {
        sittingTimeChart.destroy();
    }
    if (postureTrendsChart) {
        postureTrendsChart.destroy();
    }
}

async function createCharts() {
    const analyticsDateInput = document.querySelector("#analytics .date input");
    const selectedDate = analyticsDateInput.value;

    try {
        const response = await fetch(`http://127.0.0.1:5000/get_analytics_data?date=${selectedDate}`);
        const data = await response.json();

        // Sitting Time Pie Chart
        sittingTimeChart = new Chart(document.getElementById('sittingTimeChart'), {
            type: 'pie',
            data: {
                labels: data.chart_data?.labels || ['Sitting', 'Non-Sitting'],
                datasets: [{
                    data: data.chart_data?.data || [0, 0],
                    backgroundColor: ['#7380ec', '#ff7782'],
                    borderColor: '#363949',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--chart-text-color')
                        }
                    }
                }
            }
        });

        // Posture Trends Doughnut Chart
        postureTrendsChart = new Chart(document.getElementById('postureTrendsChart'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(data.posture_distribution || {'No Data': 1}),
                datasets: [{
                    data: Object.values(data.posture_distribution || {'No Data': 1}),
                    backgroundColor: ['#41f1b6', '#ff7782', '#ffbb55', '#7380ec'],
                    borderColor: '#363949',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--chart-text-color')
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Chart error:", error);
    }
}

// Update DOMContentLoaded event
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    initializeDatePickers();
    createCharts();
    updateDashboard();
});

// =================== POSTURE DATA MANAGEMENT ===================
async function fetchMostCommonPosture() {
    try {
        const dateInput = document.querySelector(".date input");
        const selectedDate = dateInput.value;

        const response = await fetch(`http://127.0.0.1:5000/get_most_common_posture`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            document.getElementById("sittingPosition").textContent = "No Data";
            return;
        }

        document.getElementById("sittingPosition").textContent = data.position || "Unknown";

    } catch (error) {
        console.error("Error fetching posture data:", error);
        document.getElementById("sittingPosition").textContent = "Error fetching data";
    }
}

// =================== SIDEBAR NAVIGATION ===================
const dashboardBtn = document.querySelector("#dashboard_btn");
const analyticsBtn = document.querySelector("#analytics_btn");
const settingsBtn = document.querySelector("#settings_btn");
const viewProfileBtn = document.querySelector("#view_profile_btn");

const dashboardSection = document.querySelector("#dashboard");
const analyticsSection = document.querySelector("#analytics");
const settingsSection = document.querySelector("#settings");
const userProfileSection = document.querySelector("#user-profile");

function setActiveLink(activeLink) {
    document.querySelectorAll(".sidebar a").forEach(link => link.classList.remove("active"));
    activeLink.classList.add("active");
}

function showSection(sectionToShow) {
    document.querySelectorAll(".content-section").forEach(section => section.classList.remove("active"));
    sectionToShow.classList.add("active");
}

dashboardBtn.addEventListener("click", () => {
    showSection(dashboardSection);
    setActiveLink(dashboardBtn);
});

analyticsBtn.addEventListener("click", () => {
    showSection(analyticsSection);
    setActiveLink(analyticsBtn);
    destroyCharts();
    createCharts();
});

settingsBtn.addEventListener("click", () => {
    showSection(settingsSection);
    setActiveLink(settingsBtn);
});

// =================== PROFILE MANAGEMENT ===================
async function loadProfilePhoto() {
    try {
        let response = await fetch("http://127.0.0.1:5000/get_user_profile");
        let data = await response.json();

        if (data.profile_photo) {
            const profilePhotoUrl = `/static/${data.profile_photo}`;
            document.querySelector("#profile_img").src = profilePhotoUrl;
        }
    } catch (error) {
        console.error("Error fetching profile photo:", error);
    }
}

viewProfileBtn.addEventListener("click", async function () {
    try {
        let response = await fetch("http://127.0.0.1:5000/get_user_profile");
        let data = await response.json();

        document.querySelector("#profile-name").textContent = data.name || "N/A";
        document.querySelector("#profile-email").textContent = data.email || "N/A";
        document.querySelector("#profile-gender").textContent = data.gender || "N/A";
        document.querySelector("#profile-height").textContent = data.height || "N/A";
        document.querySelector("#profile-weight").textContent = data.weight || "N/A";
        document.querySelector("#profile-bmi").textContent = data.bmi || "N/A";
        document.querySelector("#profile-bmi-status").textContent = data.bmiStatus || "N/A";
        document.querySelector("#profile-medical").textContent = data.medical_conditions ? data.medical_conditions.join(", ") : "None";
        document.querySelector("#profile-working-hours").textContent = data.working_hours || "N/A";

        if (data.profile_photo) {
            const profilePhotoUrl = `/static/${data.profile_photo}`;
            document.querySelector("#profile-pic").src = profilePhotoUrl;
        }

        showSection(userProfileSection);
        setActiveLink(viewProfileBtn);

    } catch (error) {
        console.error("Error fetching profile:", error);
        alert(`⚠ Failed to load profile: ${error.message}`);
    }
});

// =================== BMI CALCULATION ===================
function calculateBMI() {
    const height = parseFloat(document.getElementById('edit-height').value);
    const weight = parseFloat(document.getElementById('edit-weight').value);

    if (height && weight) {
        const bmiValue = (weight / Math.pow(height / 100, 2)).toFixed(1);
        const bmiStatus = getBMIStatus(bmiValue);

        document.getElementById('edit-bmi').value = bmiValue;
        document.getElementById('bmiStatus').value = bmiStatus;
    }
}

document.getElementById('edit-height').addEventListener('input', calculateBMI);
document.getElementById('edit-weight').addEventListener('input', calculateBMI);

function getBMIStatus(bmi) {
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25) return 'Normal';
    if (bmi < 30) return 'Overweight';
    return 'Obese';
}

// =================== EDIT PROFILE ===================
document.addEventListener("DOMContentLoaded", function () {
    document.querySelector("#edit-profile-link").addEventListener("click", function () {
        showSection(document.querySelector("#edit-profile"));
        loadProfileForEdit();
    });

    document.querySelector("#cancel-edit-btn").addEventListener("click", function () {
        showSection(dashboardSection);
        setActiveLink(dashboardBtn);
    });

    async function loadProfileForEdit() {
        try {
            const response = await fetch('http://127.0.0.1:5000/get_user_profile');
            const data = await response.json();

            document.getElementById('edit-name').value = data.name || '';
            document.getElementById('edit-height').value = data.height || '';
            document.getElementById('edit-weight').value = data.weight || '';
            document.getElementById('edit-bmi').value = data.bmi || '';

            document.querySelectorAll('input[name="gender"]').forEach(radio => {
                if (radio.value === data.gender) radio.checked = true;
            });

            if (Array.isArray(data.medical_conditions)) {
                data.medical_conditions.forEach(condition => {
                    const checkbox = document.querySelector(`input[name="medicalCondition"][value="${condition}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }

            document.querySelectorAll('input[name="working_hours"]').forEach(radio => {
                if (radio.value === data.working_hours) radio.checked = true;
            });

            if (data.profile_photo) {
                document.getElementById('edit-profile-preview').src = `/static/${data.profile_photo}`;
            }

        } catch (error) {
            console.error("Error loading profile for edit:", error);
        }
    }

    document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
            const response = await fetch('http://127.0.0.1:5000/update_profile', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (response.ok) {
                const profileImg = document.getElementById('profile_img');
                profileImg.src = document.getElementById('edit-profile-preview').src + `?${Date.now()}`;
                await loadProfileForEdit();
                await viewProfileBtn.click();
                showSection(userProfileSection);
            } else {
                alert(result.error || "Failed to update profile");
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });

    document.getElementById('edit-profile-photo').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('edit-profile-preview').src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
});

// =================== SETTINGS INTERACTIONS ===================
document.querySelector("#save-email-btn").addEventListener("click", async () => {
    const currentEmail = document.querySelector("#current-email").value;
    const newEmail = document.querySelector("#new-email").value;

    if (!currentEmail || !newEmail) {
        alert("⚠ Please fill in both fields.");
        return;
    }

    try {
        const response = await fetch("http://127.0.0.1:5000/update_email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentEmail, newEmail })
        });

        const result = await response.json();
        if (response.ok) {
            alert(result.message || "Email updated successfully!");
            location.reload();
        } else {
            alert(result.error || "Failed to update email");
        }
    } catch (error) {
        alert("❌ Failed to update email.");
    }
});

document.querySelector("#update-password-btn").addEventListener("click", async () => {
    const currentPassword = document.querySelector("#current-password").value;
    const newPassword = document.querySelector("#new-password").value;
    const confirmPassword = document.querySelector("#confirm-password").value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        alert("⚠ Please fill in all fields.");
        return;
    }

    if (newPassword !== confirmPassword) {
        alert("❌ New password and confirm password do not match.");
        return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
        alert("Password must contain:\n- 8+ characters\n- 1 uppercase letter\n- 1 lowercase letter\n- 1 number\n- 1 special character (@$!%*?&)");
        return;
    }

    try {
        const response = await fetch("http://127.0.0.1:5000/update_password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const result = await response.json();
        if (response.ok) {
            alert("Password updated successfully!");
            location.reload();
        } else {
            alert(result.error || "Failed to update password");
        }
    } catch (error) {
        alert("❌ Failed to update password.");
    }
});

document.querySelector("#download-analytics-btn").addEventListener("click", async () => {
    try {
        const response = await fetch("http://127.0.0.1:5000/download_analytics", {
            method: "POST",
            credentials: "include"
        });

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "posture_analytics_report.pdf";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                return;
            }
            throw new Error('Invalid response format');
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || "Failed to generate report");
        }

    } catch (error) {
        console.error("Download error:", error);
        alert(`Error: ${error.message}`);
    }
});

// =================== NOTIFICATION SYSTEM ===================
function showNotification(title, message) {
    const container = document.querySelector('.notification-container');
    const notification = container.querySelector('.notification');
    const progress = notification.querySelector('.notification-progress');
    
    notification.querySelector('.notification-title').textContent = title;
    notification.querySelector('.notification-message').textContent = message;
    
    progress.style.transform = 'scaleX(1)';
    container.style.display = 'block';
    
    setTimeout(() => {
        progress.style.transform = 'scaleX(0)';
    }, 10);
    
    setTimeout(() => {
        container.style.display = 'none';
    }, 10000);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }
    updateDashboard();
    setInterval(updateDashboard, 10000); // Update every 10 seconds
});