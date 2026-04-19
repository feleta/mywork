export function buildTaskSrcdoc(taskId, role = 'sub', index = 1) {
  const isMaster = role === 'master';
  const headerGradient = isMaster
    ? 'linear-gradient(135deg, #b45309, #92400e)'
    : 'linear-gradient(135deg, #4c6ef5, #7950f2)';
  const roleLabel = isMaster ? '主任务' : '子任务';
  const sectionTitle = isMaster
    ? '主任务广播 (主 → 全部 / 指定子任务)'
    : '子任务广播 (子 → 子)';

  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; background: #f1f3f5; color: #212529; min-height: 100vh; display: flex; flex-direction: column; gap: 20px; }

  .header-card {
    background: ${headerGradient};
    color: white; border-radius: 10px; padding: 24px 28px;
  }
  .header-card h2 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
  .header-card .meta { font-size: 12px; opacity: 0.75; margin-bottom: 6px; }
  .header-card p { font-size: 14px; opacity: 0.85; }

  .section { background: white; border-radius: 10px; padding: 20px 24px; }
  .section h4 { font-size: 15px; font-weight: 600; margin-bottom: 14px; color: #343a40; }

  .send-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .send-row input {
    padding: 7px 12px; border: 1px solid #ced4da; border-radius: 6px;
    font-size: 13px; color: #495057; background: #fff; outline: none;
  }
  .send-row input:focus { border-color: #4c6ef5; }
  #targetId { width: 160px; flex-shrink: 0; }
  #msgText  { flex: 1; min-width: 120px; }
  .send-row button {
    padding: 7px 18px; background: #f8f9fa; border: 1px solid #ced4da;
    border-radius: 6px; font-size: 13px; cursor: pointer; color: #343a40; white-space: nowrap;
  }
  .send-row button:hover { background: #e9ecef; }

  .log-label { font-size: 14px; font-weight: 600; color: #343a40; margin-bottom: 8px; }
  #log {
    background: #1a1a2e; border-radius: 8px; padding: 12px 14px;
    font-family: 'Courier New', monospace; font-size: 12px;
    min-height: 140px; max-height: 260px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 2px;
  }
  #log div { color: #94a3b8; line-height: 1.6; }
  #log div.init      { color: #4ade80; }
  #log div.send      { color: #4ade80; }
  #log div.relay     { color: #a78bfa; }
  #log div.broadcast { color: #4ade80; }
  #log div.ws        { color: #38bdf8; }
  #log div.warn      { color: #fb923c; }
  #log div.receipt-ok  { color: #34d399; }
  #log div.receipt-err { color: #f87171; }
</style>
</head>
<body>
  <div class="header-card">
    <div class="meta">${roleLabel} · T${index} · ID: ${taskId}</div>
    <h2>我是 T${index}</h2>
    <p>即便我被隐藏在后台，我依然能收到广播和处理消息。</p>
  </div>

  <div class="section">
    <h4>${sectionTitle}</h4>
    <div class="send-row">
      ${isMaster
        ? `<input id="targetId" placeholder="目标 taskId（空=全部子任务）" />`
        : `<input id="targetId" placeholder="目标子任务 taskId" />`
      }
      <input id="msgText" placeholder="你好，我是T${index}" />
      <button onclick="sendRelay()">发送</button>
    </div>
  </div>

  <div class="section">
    <div class="log-label">通信日志:</div>
    <div id="log"></div>
  </div>

  <script>
    const taskId = '${taskId}';
    const role   = '${role}';
    const logEl  = document.getElementById('log');

    function ts() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }
    function addLog(msg, cls) {
      const d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = '[' + ts() + '] ' + msg;
      logEl.appendChild(d);
      logEl.scrollTop = logEl.scrollHeight;
    }

    // ── Inline WsClient ──────────────────────────────────────────────────────

    class MessageBus {
      constructor() { this._pending = new Map(); this._handlers = new Map(); }
      receive(raw) {
        let msg; try { msg = JSON.parse(raw); } catch { return; }
        if (msg.reqId && this._pending.has(msg.reqId)) {
          const { resolve, timer } = this._pending.get(msg.reqId);
          clearTimeout(timer); this._pending.delete(msg.reqId); resolve(msg); return;
        }
        const hs = this._handlers.get(msg.type);
        if (hs) hs.forEach(fn => fn(msg));
      }
      request(socket, payload, timeout) {
        return new Promise((resolve, reject) => {
          const arr = new Uint8Array(16); crypto.getRandomValues(arr);
          const reqId = [...arr].map((b,i) => ([4,6,8,10].includes(i)?'-':'')+(b&(i===6?0x0f:i===8?0x3f:0xff)|(i===6?0x40:i===8?0x80:0)).toString(16).padStart(2,'0')).join('');
          const timer = setTimeout(() => { this._pending.delete(reqId); reject(new Error('timeout')); }, timeout || 10000);
          this._pending.set(reqId, { resolve, reject, timer });
          socket.send(JSON.stringify(Object.assign({ reqId }, payload)));
        });
      }
      on(type, fn) { if (!this._handlers.has(type)) this._handlers.set(type, new Set()); this._handlers.get(type).add(fn); }
      rejectAll(r) { for (const { reject, timer } of this._pending.values()) { clearTimeout(timer); reject(new Error(r)); } this._pending.clear(); }
    }

    class Heartbeat {
      constructor(send, opts) {
        this._send = send; this._interval = (opts&&opts.interval)||15000;
        this._timeout = (opts&&opts.timeout)||5000; this._onTimeout = (opts&&opts.onTimeout)||function(){};
        this._iid = null; this._tid = null;
      }
      start() { this.stop(); this._iid = setInterval(() => this._ping(), this._interval); }
      stop()  { clearInterval(this._iid); clearTimeout(this._tid); this._iid = this._tid = null; }
      pong()  { clearTimeout(this._tid); this._tid = null; }
      _ping() { this._send(); this._tid = setTimeout(() => { this.stop(); this._onTimeout(); }, this._timeout); }
    }

    class Reconnector {
      constructor(opts) {
        this._delay = (opts&&opts.delay)||1000; this._maxDelay = (opts&&opts.maxDelay)||30000;
        this._onReconnect = (opts&&opts.onReconnect)||function(){}; this._attempt = 0; this._tid = null; this._stopped = false;
      }
      schedule() {
        if (this._stopped || this._tid !== null) return;
        const wait = Math.min(this._delay * Math.pow(2, this._attempt), this._maxDelay);
        this._attempt++;
        this._tid = setTimeout(() => { this._tid = null; if (!this._stopped) this._onReconnect(); }, wait);
      }
      reset() { clearTimeout(this._tid); this._tid = null; this._attempt = 0; }
      stop()  { this._stopped = true; clearTimeout(this._tid); this._tid = null; }
    }

    class WsClient {
      constructor(url, opts) {
        this._url = url;
        this._opts = Object.assign({ heartbeatInterval:15000, heartbeatTimeout:5000, reconnectDelay:1000, maxReconnectDelay:30000, requestTimeout:10000 }, opts);
        this._socket = null; this._closed = false;
        this._bus = new MessageBus();
        this._rc  = new Reconnector({ delay: this._opts.reconnectDelay, maxDelay: this._opts.maxReconnectDelay, onReconnect: () => this._connect() });
        this._connect();
      }
      request(payload) {
        if (!this._socket || this._socket.readyState !== 1) return Promise.reject(new Error('not open'));
        return this._bus.request(this._socket, payload, this._opts.requestTimeout);
      }
      on(type, fn) { this._bus.on(type, fn); }
      close() { this._closed = true; this._hb && this._hb.stop(); this._rc.stop(); this._socket && this._socket.close(); }
      _connect() {
        if (this._closed) return;
        const socket = new WebSocket(this._url);
        this._socket = socket;
        this._hb = new Heartbeat(
          () => { if (socket.readyState===1) this._bus.request(socket,{action:'ping'},this._opts.heartbeatTimeout).then(()=>this._hb&&this._hb.pong()).catch(()=>socket.close()); },
          { interval: this._opts.heartbeatInterval, timeout: this._opts.heartbeatTimeout, onTimeout: () => socket.close() }
        );
        socket.addEventListener('open', () => { this._rc.reset(); this._hb.start(); onWsOpen(socket); });
        socket.addEventListener('message', e => this._bus.receive(e.data));
        socket.addEventListener('close', () => { this._hb.stop(); this._bus.rejectAll('closed'); onWsClose(); if (!this._closed) this._rc.schedule(); });
        socket.addEventListener('error', () => {});
      }
    }

    function onWsOpen(socket) {
      addLog('🔗 WS 已连接 ws://localhost:3001', 'ws');
      // register this task with the server
      wsClient.request({ action: 'register', taskId })
        .then(() => addLog('📋 已向服务端注册 taskId: ' + taskId, 'ws'))
        .catch(() => {});
    }
    function onWsClose() { addLog('⚠️  WS 断开，等待重连...', 'warn'); }

    const wsClient = new WsClient('ws://localhost:3001');

    wsClient.on('BROADCAST', (msg) => {
      addLog('📢 收到全局广播：执行 [ ' + msg.command + ' ] 指令', 'broadcast');
    });

    // ── relay send with parent-modal confirmation ────────────────────────────
    let _confirmResolve = null;

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'BROADCAST') {
        addLog('📢 收到广播：执行 [ ' + msg.payload.command + ' ] 指令', 'broadcast');
      }
      if (msg.type === 'RELAY' && msg.to === taskId) {
        addLog('📩 收到来自 [ ' + msg.from + ' ] 的消息：' + (msg.payload.text || JSON.stringify(msg.payload)), 'relay');
      }
      if (msg.type === 'RECEIPT') {
        if (msg.ok) {
          addLog('✅ 广播回执：成功送达 ' + msg.sent + ' 个节点' + (msg.failed&&msg.failed.length?'，失败: '+msg.failed.join(', '):''), 'receipt-ok');
        } else {
          addLog('❌ 广播回执：发送失败' + (msg.failed&&msg.failed.length?' ['+msg.failed.join(', ')+']':''), 'receipt-err');
        }
      }
      if (msg.type === 'CONFIRM_RESULT' && _confirmResolve) {
        const resolve = _confirmResolve;
        _confirmResolve = null;
        resolve(msg.confirmed);
      }
    });

    function requestConfirm(payload) {
      return new Promise((resolve) => {
        _confirmResolve = resolve;
        window.parent.postMessage({ type: 'CONFIRM_REQUEST', taskId, ...payload }, '*');
      });
    }

    async function sendRelay() {
      const toId = document.getElementById('targetId').value.trim();
      const text = document.getElementById('msgText').value.trim() || ('你好，我是T${index}');
      const wsOk = wsClient._socket && wsClient._socket.readyState === 1;

      if (role === 'master') {
        if (!text) {
          window.parent.postMessage({ type: 'ALERT', message: '发送内容不能为空' }, '*');
          return;
        }
        if (!wsOk) {
          window.parent.postMessage({ type: 'ALERT', message: '当前 WebSocket 未连接，无法发送' }, '*');
          return;
        }
        const confirmed = await requestConfirm({ role: 'master', text, wsOk });
        if (!confirmed) return;
        // master broadcasts via parent
        window.parent.postMessage({ type: 'MASTER_BROADCAST', from: taskId, text }, '*');
        addLog('🖱️ 已发起全局广播，内容：' + text, 'send');
      } else {
        if (!toId) {
          window.parent.postMessage({ type: 'ALERT', message: '接收方 ID 不能为空' }, '*');
          return;
        }
        if (!text) {
          window.parent.postMessage({ type: 'ALERT', message: '发送内容不能为空' }, '*');
          return;
        }
        if (!wsOk) {
          window.parent.postMessage({ type: 'ALERT', message: '当前 WebSocket 未连接，无法发送' }, '*');
          return;
        }
        const confirmed = await requestConfirm({ role: 'sub', toId, text, wsOk });
        if (!confirmed) return;
        window.parent.postMessage({ type: 'RELAY', from: taskId, to: toId, payload: { text } }, '*');
        addLog('🖱️ 尝试发消息给 [ ' + toId + ' ]...', 'send');
      }
    }

    addLog('初始化完成，已注册监听器。等待指令...', 'init');
  <\/script>
</body>
</html>`;
}
