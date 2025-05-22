document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ Script loaded!");

    const form = document.getElementById("userForm");
    const heightInput = document.getElementById("height");
    const weightInput = document.getElementById("weight");
    const bmiInput = document.getElementById("bmi");
    const bmiStatus = document.getElementById("bmiStatus");

    if (!form) {
        console.error("🚨 ERROR: Form not found!");
        return;
    }

    function calculateBMI() {
        const height = parseFloat(heightInput.value);
        const weight = parseFloat(weightInput.value);

        if (height > 0 && weight > 0) {
            const heightM = height / 100;
            const bmi = weight / (heightM ** 2);
            bmiInput.value = bmi.toFixed(2);

            let statusText = "";
            let bmiCategory = "";

            if (bmi < 18.5) {
                statusText = "Underweight (Needs Improvement)";
                bmiCategory = "Bad";
            } else if (bmi <= 24.9) {
                statusText = "Healthy Weight (Good)";
                bmiCategory = "Good";
            } else if (bmi <= 29.9) {
                statusText = "Overweight (Average)";
                bmiCategory = "Average";
            } else {
                statusText = "Obese (Bad)";
                bmiCategory = "Bad";
            }

            document.getElementById("hiddenBmiStatus").value = bmiCategory;
            bmiStatus.textContent = statusText;
            bmiStatus.style.color = bmiCategory === "Good" ? "green" :
                bmiCategory === "Average" ? "orange" : "red";
        }
    }

    heightInput.addEventListener("input", calculateBMI);
    weightInput.addEventListener("input", calculateBMI);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            const response = await fetch("http://127.0.0.1:5000/profile", {
                method: "POST",
                body: new FormData(form),
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok) {
                form.reset();
                window.location.href = "login.html";
            } else {
                alert("Error: " + (data.error || "Failed to save profile"));
            }
        } catch (error) {
            console.error("Network error:", error);
            alert("Server connection failed. Please try again.");
        } finally {
            submitButton.disabled = false;
        }
    });
});