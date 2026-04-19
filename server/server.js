const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

// clientId -> ws
const clients = new Map();
// taskId -> clientId  (registered by iframe on connect)
const taskRegistry = new Map();

wss.on('connection', (ws) => {
  const clientId = randomUUID();
  clients.set(clientId, ws);
  console.log(`[+] connected: ${clientId} (total: ${clients.size})`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { reqId, action } = msg;

    if (action === 'register') {
      // iframe registers its taskId so server can route by taskId
      const { taskId } = msg;
      taskRegistry.set(taskId, clientId);
      console.log(`[register] taskId=${taskId} -> clientId=${clientId}`);
      if (reqId) ws.send(JSON.stringify({ reqId, ok: true }));

    } else if (action === 'broadcast') {
      const { command, targets } = msg;
      const push = JSON.stringify({ type: 'BROADCAST', command });
      const failed = [];
      let sent = 0;

      if (targets && targets.length > 0) {
        // targeted: only send to specified taskIds
        for (const taskId of targets) {
          const cid = taskRegistry.get(taskId);
          const target = cid && clients.get(cid);
          if (target && target.readyState === target.OPEN) {
            target.send(push);
            sent++;
          } else {
            failed.push(taskId);
          }
        }
      } else {
        // global: send to all connected clients
        for (const [, client] of clients) {
          if (client.readyState === client.OPEN) { client.send(push); sent++; }
        }
      }

      console.log(`[broadcast] command=${command} sent=${sent} failed=${failed.length}`);
      if (reqId) ws.send(JSON.stringify({ reqId, ok: failed.length === 0, sent, failed }));

    } else if (action === 'ping') {
      if (reqId) ws.send(JSON.stringify({ reqId, action: 'pong' }));

    } else {
      if (reqId) ws.send(JSON.stringify({ reqId, ok: false, error: 'unknown action' }));
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    // remove any taskId registrations for this client
    for (const [taskId, cid] of taskRegistry) {
      if (cid === clientId) taskRegistry.delete(taskId);
    }
    console.log(`[-] disconnected: ${clientId} (total: ${clients.size})`);
  });

  ws.on('error', (err) => console.error(`[error] ${clientId}:`, err.message));

  ws.send(JSON.stringify({ type: 'CONNECTED', clientId }));
});

console.log(`WS server listening on ws://localhost:${PORT}`);
