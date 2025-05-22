document.addEventListener("DOMContentLoaded", function () {
    sessionStorage.removeItem("username");
    localStorage.removeItem("username");

    const signInBtn = document.querySelector("#sign-in-btn");
    const signUpBtn = document.querySelector("#sign-up-btn");
    const container = document.querySelector(".container");

    if (signUpBtn && signInBtn) {
        signUpBtn.addEventListener("click", () => {
            container.classList.add("sign-up-mode");
        });

        signInBtn.addEventListener("click", () => {
            container.classList.remove("sign-up-mode");
        });
    }

    function showMessage(element, message, color) {
        element.textContent = message;
        element.style.color = color;
    }

    function isValidPassword(password) {
        return /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password);
    }

    // SIGN-UP FORM
    document.querySelector(".sign-up-form").addEventListener("submit", async function (event) {
        event.preventDefault();

        let username = document.querySelector("input[name='signup-username']").value.trim();
        let email = document.querySelector("input[name='signup-email']").value.trim();
        let password = document.querySelector("#signup-password").value.trim();
        let confirmPassword = document.querySelector("#confirm-password").value.trim();
        let signupMessage = document.querySelector(".signup-message");

        if (!username || !email || !password || !confirmPassword) {
            showMessage(signupMessage, "❌ Please fill in all fields.", "red");
            return;
        }

        if (!isValidPassword(password)) {
            showMessage(signupMessage, "❌ Weak Password! Follow the password rules.", "red");
            return;
        }

        if (password !== confirmPassword) {
            showMessage(signupMessage, "❌ Passwords do not match!", "red");
            return;
        }

        try {
            let response = await fetch("http://127.0.0.1:5000/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password }),
                credentials: 'include'
            });

            let data = await response.json();

            if (response.ok) {
                showMessage(signupMessage, "✅ Signup successful! Redirecting to profile...", "green");
                setTimeout(() => {
                    window.location.href = "userprofile.html";
                }, 1500);
            } else {
                showMessage(signupMessage, `❌ ${data.error}`, "red");
            }
        } catch (error) {
            showMessage(signupMessage, "❌ Network error. Try again.", "red");
        }
    });

    // SIGN-IN FORM
    document.querySelector(".sign-in-form").addEventListener("submit", async function (event) {
        event.preventDefault();

        let username = document.querySelector("input[name='signin-username']").value.trim();
        let password = document.querySelector("input[name='signin-password']").value.trim();
        let signinMessage = document.querySelector(".signin-message");

        if (!username || !password) {
            showMessage(signinMessage, "❌ Please enter both username and password.", "red");
            return;
        }

        try {
            let response = await fetch("http://127.0.0.1:5000/signin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
                credentials: 'include'
            });

            let data = await response.json();

            if (response.ok) {
                localStorage.setItem("username", username);
                sessionStorage.setItem("username", username);

                showMessage(signinMessage, `✅ Welcome, ${username}! Redirecting...`, "green");
                setTimeout(() => {
                    window.location.href = "/templates/home.html";
                }, 2000);
            } else {
                showMessage(signinMessage, `❌ ${data.error}`, "red");
            }
        } catch (error) {
            showMessage(signinMessage, "❌ Network error. Try again.", "red");
        }
    });
});

window.addEventListener('scroll', function () {
    window.scrollTo(0, 0);
});