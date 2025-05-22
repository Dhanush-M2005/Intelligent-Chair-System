document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("get-started").addEventListener("click", function() {
        window.location.href = "login.html";
    });

    document.getElementById("contact-form").addEventListener("submit", async function(event) {
        event.preventDefault();

        let name = document.getElementById("name").value.trim();
        let email = document.getElementById("email").value.trim();
        let message = document.getElementById("message").value.trim();
        let formMessage = document.getElementById("form-message");

        if (name && email && message) {
            let contactData = { name, email, message };

            try {
                let response = await fetch("http://127.0.0.1:5000/submit_contact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(contactData),
                    credentials: 'include'
                });

                let result = await response.json();
                
                if (response.ok) {
                    formMessage.textContent = result.message;
                    formMessage.style.color = "Light Orange";
                    this.reset();
                } else {
                    formMessage.textContent = result.error || "Error submitting form.";
                    formMessage.style.color = "red";
                }

                setTimeout(() => { formMessage.textContent = ""; }, 2000);
            } catch (error) {
                console.error("Fetch error:", error);
                formMessage.textContent = "Error connecting to server.";
                formMessage.style.color = "red";
            }
        } else {
            formMessage.textContent = "All fields are required!";
            formMessage.style.color = "red";
        }
    });
});

// Mobile Menu Toggle
function toggleMenu() {
    document.querySelector(".nav-links").classList.toggle("show");
}