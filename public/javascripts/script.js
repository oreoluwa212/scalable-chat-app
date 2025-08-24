const socket = io();
let username = "";
let currentRoom = "general";
let isTyping = false;
let typingTimeout;

function joinChat() {
  username = document.getElementById("usernameInput").value.trim();
  const selectedRoom = document.getElementById("roomSelect").value || "general";

  if (username) {
    socket.emit("join", { username, room: selectedRoom });
    document.getElementById("loginArea").style.display = "none";
    document.getElementById("chatInterface").style.display = "flex";
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

function createRoom() {
  const modal = document.getElementById("createRoomModal");
  modal.style.display = "block";
}

function closeCreateRoomModal() {
  const modal = document.getElementById("createRoomModal");
  modal.style.display = "none";
  document.getElementById("newRoomId").value = "";
  document.getElementById("newRoomName").value = "";
}

function submitCreateRoom() {
  const roomId = document.getElementById("newRoomId").value.trim();
  const roomName = document.getElementById("newRoomName").value.trim();

  if (roomId) {
    socket.emit("createRoom", {
      roomId,
      roomName: roomName || roomId,
      isPrivate: false
    });
  }
}

function switchRoom(roomId) {
  if (roomId !== currentRoom) {
    socket.emit("switchRoom", { roomId });
  }
}

function refreshRooms() {
  socket.emit("getRooms");
}

// Socket event listeners
socket.on("joinConfirmed", (data) => {
  currentRoom = data.room;
  updateCurrentRoomDisplay();
  clearChat();
});

socket.on("roomSwitched", (data) => {
  currentRoom = data.newRoom;
  updateCurrentRoomDisplay();
  clearChat();
  addSystemMessage(`Switched to room: ${data.newRoom}`);
});

socket.on("roomHistory", (messages) => {
  clearChat();
  messages.forEach(msg => addMessage(msg, msg.username === username));
});

socket.on("roomsList", (rooms) => {
  updateRoomsList(rooms);
  updateRoomSelect(rooms);
});

socket.on("roomCreated", (room) => {
  addSystemMessage(`New room created: ${room.name}`);
});

socket.on("roomCreateSuccess", (room) => {
  closeCreateRoomModal();
  addSystemMessage(`Room "${room.name}" created successfully!`);
});

socket.on("roomCreateError", (error) => {
  alert(`Error creating room: ${error.message}`);
});

socket.on("switchRoomError", (error) => {
  alert(`Error switching room: ${error.message}`);
});

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
  updateUsersList(users);
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

socket.on("error", (error) => {
  alert(error.message);
});

// UI Update Functions
function updateCurrentRoomDisplay() {
  document.getElementById("currentRoom").textContent = currentRoom;
}

function updateRoomsList(rooms) {
  const roomsList = document.getElementById("roomsList");
  roomsList.innerHTML = "";

  rooms.forEach(room => {
    const roomItem = document.createElement("div");
    roomItem.className = `room-item ${room.id === currentRoom ? 'active' : ''}`;
    roomItem.onclick = () => switchRoom(room.id);

    roomItem.innerHTML = `
      <div class="room-name">${room.name}</div>
      <div class="room-users">${room.userCount} users</div>
    `;

    roomsList.appendChild(roomItem);
  });
}

function updateRoomSelect(rooms) {
  const roomSelect = document.getElementById("roomSelect");
  roomSelect.innerHTML = "";

  rooms.forEach(room => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = `${room.name} (${room.userCount} users)`;
    roomSelect.appendChild(option);
  });
}

function updateUsersList(users) {
  const usersList = document.getElementById("usersList");
  if (Array.isArray(users)) {
    usersList.textContent = users.map(u => u.username || u).join(", ");
  } else {
    usersList.textContent = users.join ? users.join(", ") : "No users";
  }
}

function clearChat() {
  document.getElementById("chatArea").innerHTML = "";
}

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

// Event Listeners
document.getElementById("messageInput")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  } else {
    if (!isTyping) {
      socket.emit("typing", true);
      isTyping = true;
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("typing", false);
      isTyping = false;
    }, 2000);
  }
});

document.getElementById("usernameInput")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") joinChat();
});

document.getElementById("newRoomId")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") submitCreateRoom();
});

document.getElementById("newRoomName")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") submitCreateRoom();
});

// Close modal when clicking outside
window.onclick = function (event) {
  const modal = document.getElementById("createRoomModal");
  if (event.target === modal) {
    closeCreateRoomModal();
  }
}

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