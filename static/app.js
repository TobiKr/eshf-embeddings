/**
 * Chat UI client-side logic
 */

// State management
const state = {
    conversationHistory: [],
    isAuthenticated: false,
    isProcessing: false,
};

// DOM elements
const passwordModal = document.getElementById('passwordModal');
const passwordInput = document.getElementById('passwordInput');
const passwordSubmit = document.getElementById('passwordSubmit');
const passwordError = document.getElementById('passwordError');
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
});

/**
 * Check if user is already authenticated
 */
function checkAuthentication() {
    const isAuth = sessionStorage.getItem('authenticated');
    if (isAuth === 'true') {
        state.isAuthenticated = true;
        showChat();
    } else {
        showPasswordModal();
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Password submission
    passwordSubmit.addEventListener('click', handlePasswordSubmit);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handlePasswordSubmit();
        }
    });

    // Message sending
    sendButton.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
}

/**
 * Handle password submission
 */
async function handlePasswordSubmit() {
    const password = passwordInput.value.trim();

    if (!password) {
        showError('Bitte geben Sie ein Passwort ein');
        return;
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password }),
        });

        const data = await response.json();

        if (data.success) {
            state.isAuthenticated = true;
            sessionStorage.setItem('authenticated', 'true');
            showChat();
        } else {
            showError(data.message || 'Ungültiges Passwort');
        }
    } catch (error) {
        console.error('Authentication error:', error);
        showError('Verbindungsfehler. Bitte versuchen Sie es erneut.');
    }
}

/**
 * Show error message in password modal
 */
function showError(message) {
    passwordError.textContent = message;
    passwordError.classList.add('show');
    setTimeout(() => {
        passwordError.classList.remove('show');
    }, 3000);
}

/**
 * Show password modal
 */
function showPasswordModal() {
    passwordModal.style.display = 'flex';
    chatContainer.classList.add('hidden');
    passwordInput.focus();
}

/**
 * Show chat interface
 */
function showChat() {
    passwordModal.style.display = 'none';
    chatContainer.classList.remove('hidden');
    messageInput.focus();
}

/**
 * Handle send message
 */
async function handleSendMessage() {
    const message = messageInput.value.trim();

    if (!message || state.isProcessing) {
        return;
    }

    // Add user message to UI
    addMessage(message, 'user');
    state.conversationHistory.push({ role: 'user', content: message });

    // Clear input
    messageInput.value = '';
    state.isProcessing = true;
    sendButton.disabled = true;

    // Add loading indicator
    const loadingMessageId = addLoadingMessage();

    try {
        // Call chat API with streaming
        await streamChatResponse(message, loadingMessageId);
    } catch (error) {
        console.error('Chat error:', error);
        removeMessage(loadingMessageId);
        addMessage('Entschuldigung, es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.', 'assistant');
    } finally {
        state.isProcessing = false;
        sendButton.disabled = false;
        messageInput.focus();
    }
}

/**
 * Stream chat response from API
 */
async function streamChatResponse(message, loadingMessageId) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message,
            conversationHistory: state.conversationHistory,
        }),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Remove loading indicator
    removeMessage(loadingMessageId);

    // Create assistant message container
    const messageId = addMessage('', 'assistant');
    const messageElement = document.getElementById(messageId);
    const contentElement = messageElement.querySelector('.message-content');

    let fullResponse = '';

    // Read stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = JSON.parse(line.substring(6));

                if (data.type === 'content') {
                    fullResponse += data.text;
                    contentElement.innerHTML = formatText(fullResponse);
                    scrollToBottom();
                } else if (data.type === 'sources') {
                    addSources(messageElement, data.sources);
                    scrollToBottom();
                } else if (data.type === 'error') {
                    contentElement.innerHTML = `<p style="color: #e53e3e;">Fehler: ${data.error}</p>`;
                }
            }
        }
    }

    // Save assistant response to history
    state.conversationHistory.push({ role: 'assistant', content: fullResponse });
}

/**
 * Add message to chat
 */
function addMessage(text, role) {
    const messageId = `msg-${Date.now()}-${Math.random()}`;
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = `message ${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatText(text);

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    scrollToBottom();

    return messageId;
}

/**
 * Add loading message
 */
function addLoadingMessage() {
    const messageId = `msg-loading-${Date.now()}`;
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = 'message assistant';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = '<span class="loading"></span><span class="loading" style="margin-left: 8px;"></span><span class="loading" style="margin-left: 8px;"></span>';

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    scrollToBottom();

    return messageId;
}

/**
 * Remove message
 */
function removeMessage(messageId) {
    const element = document.getElementById(messageId);
    if (element) {
        element.remove();
    }
}

/**
 * Add sources to message
 */
function addSources(messageElement, sources) {
    if (!sources || sources.length === 0) {
        return;
    }

    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'sources';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'sources-title';
    titleDiv.textContent = '📚 Quellen:';
    sourcesDiv.appendChild(titleDiv);

    sources.forEach((source) => {
        const sourceItem = document.createElement('div');
        sourceItem.className = 'source-item';

        const meta = document.createElement('div');
        meta.className = 'source-meta';
        meta.textContent = `${source.author} • ${source.date} • ${source.category} • Relevanz: ${source.relevance}%`;

        const title = document.createElement('div');
        title.className = 'source-title';
        title.textContent = source.threadTitle;

        const excerpt = document.createElement('div');
        excerpt.className = 'source-excerpt';
        excerpt.textContent = source.excerpt;

        sourceItem.appendChild(meta);
        sourceItem.appendChild(title);
        sourceItem.appendChild(excerpt);

        sourcesDiv.appendChild(sourceItem);
    });

    messageElement.appendChild(sourcesDiv);
}

/**
 * Format text with basic markdown-like styling
 */
function formatText(text) {
    if (!text) return '';

    // Escape HTML
    let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Convert line breaks to paragraphs
    formatted = formatted
        .split('\n\n')
        .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('');

    return formatted;
}

/**
 * Scroll chat to bottom
 */
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
