let socket;
let username = "";
let isTyping = false;
let typingTimeout;
let isAuthenticated = false;
let userProfile = null;
let authToken = localStorage.getItem('authToken');

// Initialize socket connection
function initSocket() {
  socket = io({
    auth: {
      token: authToken
    }
  });
  setupSocketListeners();
}

function setupSocketListeners() {
  socket.on('connect', () => {
    console.log('Connected to server');
  });

  socket.on('authSuccess', (data) => {
    isAuthenticated = true;
    userProfile = data.user;
    updateAuthUI();
  });

  socket.on('authError', (error) => {
    console.error('Authentication error:', error.message);
    localStorage.removeItem('authToken');
    authToken = null;
    isAuthenticated = false;
  });

  socket.on('joinConfirmed', (data) => {
    username = data.username;
    isAuthenticated = data.isAuthenticated;
    userProfile = data.userProfile;
    updateAuthUI();
    document.getElementById("loginArea").style.display = "none";
    document.getElementById("chatArea").style.display = "block";
    document.getElementById("messageInput").focus();
  });

  socket.on("message", (data) => {
    addMessage(data, data.username === username);
  });

  socket.on("userJoined", (data) => {
    addSystemMessage(`${data.message} ${data.isAuthenticated ? '👤' : '👻'}`);
  });

  socket.on("userLeft", (data) => {
    addSystemMessage(`${data.message} ${data.isAuthenticated ? '👤' : '👻'}`);
  });

  socket.on("roomUsers", (users) => {
    updateUsersList(users);
  });

  socket.on("userTyping", (data) => {
    const indicator = document.getElementById("typingIndicator");
    if (data.isTyping) {
      const avatar = data.avatar ? `<img src="${data.avatar}" class="typing-avatar" alt="">` : '';
      indicator.innerHTML = `${avatar}${data.username} is typing... ${data.isAuthenticated ? '👤' : '👻'}`;
      indicator.style.display = "block";
    } else {
      indicator.style.display = "none";
    }
  });

  socket.on("profileUpdated", (profile) => {
    userProfile = profile;
    updateAuthUI();
    addSystemMessage("Profile updated successfully!");
  });

  socket.on("profileUpdateError", (error) => {
    alert(`Profile update error: ${error.message}`);
  });

  socket.on("userProfileUpdated", (data) => {
    addSystemMessage(`${data.username} updated their profile`);
  });

  socket.on("logoutSuccess", () => {
    isAuthenticated = false;
    userProfile = null;
    authToken = null;
    localStorage.removeItem('authToken');
    updateAuthUI();
    addSystemMessage("Logged out successfully");
  });

  socket.on("error", (error) => {
    alert(error.message);
  });
}

// Authentication functions
async function showAuthModal(mode = 'login') {
  document.getElementById("authModal").style.display = "block";
  document.getElementById("authMode").textContent = mode === 'login' ? 'Login' : 'Register';
  document.getElementById("authForm").dataset.mode = mode;

  const emailField = document.getElementById("emailField");
  if (mode === 'register') {
    emailField.style.display = "block";
    emailField.querySelector('input').required = true;
  } else {
    emailField.style.display = "none";
    emailField.querySelector('input').required = false;
  }
}

function closeAuthModal() {
  document.getElementById("authModal").style.display = "none";
  document.getElementById("authForm").reset();
}

async function submitAuth() {
  const form = document.getElementById("authForm");
  const mode = form.dataset.mode;
  const emailOrUsername = document.getElementById("emailOrUsername").value.trim();
  const password = document.getElementById("password").value;
  const email = document.getElementById("email").value.trim();

  if (!emailOrUsername || !password) {
    alert("Please fill in all required fields");
    return;
  }

  if (mode === 'register' && !email) {
    alert("Email is required for registration");
    return;
  }

  try {
    const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
    const body = mode === 'login'
      ? { emailOrUsername, password }
      : { username: emailOrUsername, email, password };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (result.success) {
      authToken = result.token;
      localStorage.setItem('authToken', authToken);
      isAuthenticated = true;
      userProfile = result.user;

      // Reconnect socket with auth token
      if (socket) {
        socket.disconnect();
      }
      initSocket();

      closeAuthModal();
      updateAuthUI();
      addSystemMessage(`${mode === 'login' ? 'Logged in' : 'Registered'} successfully as ${result.user.username}!`);
    } else {
      alert(result.error);
    }
  } catch (error) {
    console.error('Auth error:', error);
    alert('Authentication failed. Please try again.');
  }
}

function logout() {
  if (isAuthenticated) {
    socket.emit('logout');
  }
}

function showProfileModal() {
  if (!isAuthenticated) {
    alert("Please login to view profile");
    return;
  }

  document.getElementById("profileModal").style.display = "block";
  document.getElementById("profileUsername").textContent = userProfile.username;
  document.getElementById("profileEmail").textContent = userProfile.email || 'Not provided';
  document.getElementById("profileBio").value = userProfile.bio || '';
  document.getElementById("profileAvatar").value = userProfile.avatar || '';
  document.getElementById("profileJoined").textContent = new Date(userProfile.joinedAt).toLocaleDateString();
  document.getElementById("profileMessages").textContent = userProfile.totalMessages || 0;
}

function closeProfileModal() {
  document.getElementById("profileModal").style.display = "none";
}

function updateProfile() {
  const bio = document.getElementById("profileBio").value.trim();
  const avatar = document.getElementById("profileAvatar").value.trim();

  socket.emit('updateProfile', { bio, avatar });
  closeProfileModal();
}

// Chat functions
function joinChat() {
  const usernameInput = document.getElementById("usernameInput").value.trim();

  if (!isAuthenticated && !usernameInput) {
    alert("Please enter a username or login");
    return;
  }

  socket.emit("join", {
    username: isAuthenticated ? userProfile.username : usernameInput,
    room: "general"
  });
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

function updateAuthUI() {
  const authControls = document.getElementById("authControls");
  const usernameInput = document.getElementById("usernameInput");

  if (isAuthenticated && userProfile) {
    authControls.innerHTML = `
      <div class="user-info">
        <img src="${userProfile.avatar || '/images/default-avatar.png'}" alt="Avatar" class="user-avatar">
        <span class="username">${userProfile.username}</span>
        <span class="user-badge">👤</span>
      </div>
      <button onclick="showProfileModal()" class="profile-btn">Profile</button>
      <button onclick="logout()" class="logout-btn">Logout</button>
    `;
    usernameInput.style.display = "none";
  } else {
    authControls.innerHTML = `
      <button onclick="showAuthModal('login')" class="auth-btn">Login</button>
      <button onclick="showAuthModal('register')" class="auth-btn">Register</button>
    `;
    usernameInput.style.display = "block";
  }
}

function updateUsersList(users) {
  const usersList = document.getElementById("usersList");
  const userElements = users.map(user => {
    const badge = user.isAuthenticated ? '👤' : '👻';
    const avatar = user.avatar ? `<img src="${user.avatar}" class="user-list-avatar" alt="">` : '';
    const status = user.status ? `(${user.status})` : '';
    return `${avatar}${user.username} ${badge} ${status}`;
  });
  usersList.innerHTML = userElements.join(", ");
}

function addMessage(data, isOwn) {
  const chatArea = document.getElementById("chatArea");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isOwn ? "own" : "other"} ${data.isAuthenticated ? 'authenticated' : 'guest'}`;

  const avatar = data.avatar ? `<img src="${data.avatar}" class="message-avatar" alt="">` : '';
  const badge = data.isAuthenticated ? '👤' : '👻';

  messageDiv.innerHTML = `
    <div class="message-header">
      ${avatar}
      <strong>${data.username}</strong> ${badge}
      <small class="message-time">${new Date(data.timestamp).toLocaleTimeString()}</small>
    </div>
    <div class="message-content">${data.message}</div>
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

// Event listeners
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

// Modal event listeners
window.onclick = function (event) {
  const authModal = document.getElementById("authModal");
  const profileModal = document.getElementById("profileModal");

  if (event.target === authModal) {
    closeAuthModal();
  }
  if (event.target === profileModal) {
    closeProfileModal();
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
        👤 Auth Users: ${data.authenticatedUsers} | 
        👻 Guests: ${data.guestUsers} | 
        ⏱️ Uptime: ${Math.floor(data.uptime)}s
      `;
    })
    .catch((error) => console.error("Stats error:", error));
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  updateAuthUI();
  setInterval(loadStats, 5000);
  loadStats();
});