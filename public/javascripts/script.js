const socket = io();
let username = "";
let isTyping = false;
let typingTimeout;

function joinChat() {
  console.log("Join button clicked");
  username = document.getElementById("usernameInput").value.trim();
  console.log("Username:", username);

  if (username) {
    socket.emit("join", { username, room: "general" });
    document.getElementById("usernameInput").style.display = "none";
    document.querySelector(".input-area button").style.display = "none";
    document.getElementById("messageArea").style.display = "flex";
    document.getElementById("messageInput").focus();
  }
}

function sendMessage() {
  const messageInput = document.getElementById("messageInput");
  const message = messageInput.value.trim();
  if (message) {
    socket.emit("message", { message });
    messageInput.value = "";
    if (isTyping) {
      socket.emit("typing", false);
      isTyping = false;
    }
  }
}

// Socket events
socket.on("message", (data) => {
  addMessage(data, data.username === username);
});

socket.on("userJoined", (data) => {
  addSystemMessage(data.message);
});

socket.on("userLeft", (data) => {
  addSystemMessage(data.message);
});

socket.on("roomUsers", (users) => {
  document.getElementById("usersList").textContent = users.join(", ");
});

socket.on("userTyping", (data) => {
  const indicator = document.getElementById("typingIndicator");
  if (data.isTyping) {
    indicator.textContent = `${data.username} is typing...`;
    indicator.style.display = "block";
  } else {
    indicator.style.display = "none";
  }
});

function addMessage(data, isOwn) {
  const chatArea = document.getElementById("chatArea");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isOwn ? "own" : "other"}`;
  messageDiv.innerHTML = `
        <strong>${data.username}:</strong> ${data.message}
        <small style="display: block; margin-top: 5px; opacity: 0.8; font-size: 0.8rem;">
            ${new Date(data.timestamp).toLocaleTimeString()}
        </small>
    `;
  chatArea.appendChild(messageDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addSystemMessage(message) {
  const chatArea = document.getElementById("chatArea");
  const messageDiv = document.createElement("div");
  messageDiv.className = "system-message";
  messageDiv.textContent = message;
  chatArea.appendChild(messageDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Enter key handlers
document.getElementById("messageInput")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

document.getElementById("usernameInput")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") joinChat();
});

// Load stats
function loadStats() {
  fetch("/api/stats")
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("stats").innerHTML = `
                🟢 Active: ${data.activeConnections} | 
                💬 Messages: ${data.totalMessages} | 
                🏠 Rooms: ${data.activeRooms} | 
                ⏱️ Uptime: ${Math.floor(data.uptime)}s
            `;
    })
    .catch((error) => console.error("Stats error:", error));
}

setInterval(loadStats, 5000);
loadStats();
