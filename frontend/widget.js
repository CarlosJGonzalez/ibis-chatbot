(function () {
  const scriptTag = document.currentScript;
  const API_URL = scriptTag?.getAttribute('data-api-url') || '/api/chat';
  const BOT_NAME = scriptTag?.getAttribute('data-bot-name') || 'Asistente Virtual';
  const PRIMARY_COLOR = scriptTag?.getAttribute('data-color') || '#111827';

  const host = document.createElement('div');
  host.id = 'custom-chatbot-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    .launcher {
      position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;
      border-radius: 50%; background: ${PRIMARY_COLOR}; color: #fff; border: none;
      cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 24px;
      display: flex; align-items: center; justify-content: center; z-index: 999999;
      transition: transform 0.2s;
    }
    .launcher:hover { transform: scale(1.05); }
    .window {
      position: fixed; bottom: 90px; right: 20px; width: 350px; height: 480px;
      background: #fff; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      display: none; flex-direction: column; overflow: hidden; z-index: 999999;
      border: 1px solid #e5e7eb;
    }
    .window.open { display: flex; }
    .header {
      background: ${PRIMARY_COLOR}; color: #fff; padding: 14px 16px;
      font-weight: 600; display: flex; justify-content: space-between; align-items: center;
    }
    .close-btn { background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; }
    .messages {
      flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;
      background: #f9fafb;
    }
    .msg {
      max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.4;
      word-wrap: break-word; white-space: pre-wrap;
    }
    .msg.user { background: ${PRIMARY_COLOR}; color: #fff; align-self: flex-end; border-bottom-right-radius: 2px; }
    .msg.bot { background: #e5e7eb; color: #111827; align-self: flex-start; border-bottom-left-radius: 2px; }
    .input-area {
      display: flex; border-top: 1px solid #e5e7eb; padding: 10px; background: #fff;
    }
    input {
      flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px;
      font-size: 14px; outline: none;
    }
    input:focus { border-color: ${PRIMARY_COLOR}; }
    .send-btn {
      margin-left: 8px; background: ${PRIMARY_COLOR}; color: #fff; border: none;
      border-radius: 6px; padding: 0 14px; cursor: pointer; font-weight: 500;
    }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  `;

  const container = document.createElement('div');
  container.innerHTML = `
    <button class="launcher" aria-label="Abrir chat">💬</button>
    <div class="window">
      <div class="header">
        <span>${BOT_NAME}</span>
        <button class="close-btn">&times;</button>
      </div>
      <div class="messages">
        <div class="msg bot">Hello, how could I help you?</div>
      </div>
      <form class="input-area">
        <input type="text" placeholder="Send a question..." required />
        <button type="submit" class="send-btn">Enviar</button>
      </form>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(container);

  const launcher = shadow.querySelector('.launcher');
  const chatWindow = shadow.querySelector('.window');
  const closeBtn = shadow.querySelector('.close-btn');
  const form = shadow.querySelector('.input-area');
  const input = shadow.querySelector('input');
  const messagesBox = shadow.querySelector('.messages');
  const sendBtn = shadow.querySelector('.send-btn');

  let history = [];

  launcher.addEventListener('click', () => chatWindow.classList.toggle('open'));
  closeBtn.addEventListener('click', () => chatWindow.classList.remove('open'));

  function createMessageBubble(sender, initialText = '') {
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.textContent = initialText;
    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    return div;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    createMessageBubble('user', text);
    history.push({ role: 'user', content: text });
    input.value = '';
    sendBtn.disabled = true;

    const botBubble = createMessageBubble('bot', '...');
    let fullReply = '';

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ messages: history })
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstToken = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          let payload = line.trim();
          if (!payload || payload.startsWith(':')) continue;

          while (payload.startsWith('data:')) {
            payload = payload.slice(5).trim();
          }

          if (!payload || payload === '[DONE]') continue;
          if (!payload.startsWith('{')) continue;

          try {
            const data = JSON.parse(payload);
            if (data.error) throw new Error(data.error);

            const deltaToken =
              typeof data.token === 'string'
                ? data.token
                : data.choices?.[0]?.delta?.content || '';

            if (deltaToken) {
              if (firstToken) {
                botBubble.textContent = '';
                firstToken = false;
              }
              fullReply += deltaToken;
              botBubble.textContent = fullReply;
              messagesBox.scrollTop = messagesBox.scrollHeight;
            }
          } catch (parseErr) {
            console.warn('Fragmento SSE ignorado:', payload, parseErr);
          }
        }
      }

      if (!fullReply) {
        botBubble.textContent = 'Sin respuesta.';
      } else {
        history.push({ role: 'assistant', content: fullReply });
      }
    } catch (err) {
      console.error('Error en stream SSE:', err);
      botBubble.textContent = `Error: ${err.message || 'al recibir el stream'}`;
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });
})();