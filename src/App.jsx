import { createRef, useState, useEffect, useRef } from "react";
import { Modal, message as antMessage } from "antd";
import { generateId } from "./utils/idGen";
import { buildTaskSrcdoc } from "./utils/taskSrcdoc";
import { useMessageRouter } from "./hooks/useMessageRouter";
import { WsClient } from "./ws/WsClient";
import TopBar from "./components/TopBar/TopBar";
import Sidebar from "./components/Sidebar/Sidebar";
import IframePanel from "./components/IframePanel/IframePanel";
import ContextMenu from "./components/ContextMenu/ContextMenu";
import styles from "./App.module.css";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const wsClientRef = useRef(null);
  const tasksRef = useRef(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    const client = new WsClient("ws://localhost:3001");
    wsClientRef.current = client;
    return () => client.close();
  }, []);

  // auto-create master task on mount
  useEffect(() => {
    const id = generateId();
    const task = {
      id,
      label: "T1",
      index: 1,
      role: "master",
      iframeRef: createRef(),
      srcdoc: buildTaskSrcdoc(id, "master", 1),
    };
    setTasks([task]);
    setActiveTaskId(id);
  }, []);

  useMessageRouter(tasks);

  function handleAdd() {
    const id = generateId();
    const index = tasksRef.current.length + 1;
    const task = {
      id,
      label: `T${index}`,
      index,
      role: "sub",
      iframeRef: createRef(),
      srcdoc: buildTaskSrcdoc(id, "sub", index),
    };
    setTasks((prev) => [...prev, task]);
    setActiveTaskId(id);
  }

  function handleDelete(taskId) {
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== taskId);
      setActiveTaskId((cur) => {
        if (cur !== taskId) return cur;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
  }

  function handleContextMenu(e, taskId) {
    setContextMenu({ taskId, x: e.clientX, y: e.clientY });
  }

  async function handleBroadcast(command, targetIds, senderTaskId) {
    const allTasks = tasksRef.current;
    const targets =
      targetIds && targetIds.length > 0
        ? allTasks.filter((t) => targetIds.includes(t.id))
        : allTasks;

    targets.forEach((t) => {
      t.iframeRef.current?.contentWindow?.postMessage(
        { type: "BROADCAST", payload: { command } },
        "*",
      );
    });

    let receipt = { ok: true, sent: targets.length, failed: [] };
    const ws = wsClientRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        const res = await ws.request({
          action: "broadcast",
          command,
          targets: targetIds && targetIds.length > 0 ? targetIds : [],
        });
        receipt = {
          ok: res.ok,
          sent: res.sent ?? targets.length,
          failed: res.failed ?? [],
        };
      } catch {
        receipt = { ok: false, sent: 0, failed: targetIds ?? [] };
      }
    }

    if (senderTaskId) {
      const sender = allTasks.find((t) => t.id === senderTaskId);
      sender?.iframeRef.current?.contentWindow?.postMessage(
        { type: "RECEIPT", ...receipt },
        "*",
      );
    }
  }

  function handleTopBarBroadcast(command) {
    const allTasks = tasksRef.current;
    const activeTask = allTasks.find((t) => t.id === activeTaskId);
    if (!activeTask) return;
    const subTasks = allTasks.filter((t) => t.role === "sub");
    const targetIds =
      activeTask.role === "master"
        ? subTasks.map((t) => t.id)
        : subTasks.filter((t) => t.id !== activeTask.id).map((t) => t.id);
    handleBroadcast(command, targetIds, activeTask.id);
  }

  // handle messages from iframes
  useEffect(() => {
    function handler(event) {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === "ALERT") {
        antMessage.error(msg.message);
        return;
      }

      if (msg.type === "CONFIRM_REQUEST") {
        const { taskId: senderTaskId, role, toId, text, wsOk } = msg;
        const senderTask = tasksRef.current.find((t) => t.id === senderTaskId);
        const senderIframe = senderTask?.iframeRef.current?.contentWindow;

        const sendResult = (confirmed) => {
          senderIframe?.postMessage({ type: "CONFIRM_RESULT", confirmed }, "*");
        };

        const wsStatus = wsOk ? "✅ 已连接" : "❌ 未连接";

        if (role === "master") {
          Modal.confirm({
            title: "确认发起全局广播？",
            content: (
              <div style={{ lineHeight: "2" }}>
                <div>
                  发送内容：<b>{text}</b>
                </div>
                <div>WS 状态：{wsStatus}</div>
                <div>目标：全部子任务</div>
              </div>
            ),
            okText: "确认发送",
            cancelText: "取消",
            onOk: () => sendResult(true),
            onCancel: () => sendResult(false),
          });
        } else {
          Modal.confirm({
            title: "确认发送消息？",
            content: (
              <div style={{ lineHeight: "2" }}>
                <div>
                  接收方 ID：<b>{toId}</b>
                </div>
                <div>
                  发送内容：<b>{text}</b>
                </div>
                <div>WS 状态：{wsStatus}</div>
              </div>
            ),
            okText: "确认发送",
            cancelText: "取消",
            onOk: () => sendResult(true),
            onCancel: () => sendResult(false),
          });
        }
        return;
      }

      // master broadcast triggered from iframe
      if (msg.type === "MASTER_BROADCAST") {
        const allTasks = tasksRef.current;
        const subTasks = allTasks.filter((t) => t.role === "sub");
        const targetIds = subTasks.map((t) => t.id);
        // send text content directly to each sub iframe
        subTasks.forEach((t) => {
          t.iframeRef.current?.contentWindow?.postMessage(
            { type: "BROADCAST", payload: { command: msg.text } },
            "*",
          );
        });
        // receipt back to master
        const master = allTasks.find((t) => t.id === msg.from);
        master?.iframeRef.current?.contentWindow?.postMessage(
          { type: "RECEIPT", ok: true, sent: targetIds.length, failed: [] },
          "*",
        );
        return;
      }

      // relay routing with receipt
      if (msg.type === "RELAY") {
        const target = tasksRef.current.find((t) => t.id === msg.to);
        const sender = tasksRef.current.find((t) => t.id === msg.from);
        const delivered = !!target?.iframeRef.current?.contentWindow;
        if (delivered) {
          target.iframeRef.current.contentWindow.postMessage(msg, "*");
        }
        sender?.iframeRef.current?.contentWindow?.postMessage(
          {
            type: "RECEIPT",
            ok: delivered,
            sent: delivered ? 1 : 0,
            failed: delivered ? [] : [msg.to],
          },
          "*",
        );
      }
    }

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div className={styles.app}>
      <TopBar
        wsClient={wsClientRef.current}
        onBroadcast={handleTopBarBroadcast}
        isMasterActive={
          tasks.find((t) => t.id === activeTaskId)?.role === "master"
        }
      />
      <Sidebar
        tasks={tasks}
        activeTaskId={activeTaskId}
        onSelect={setActiveTaskId}
        onAdd={handleAdd}
        onContextMenu={handleContextMenu}
      />
      <IframePanel tasks={tasks} activeTaskId={activeTaskId} />
      <ContextMenu
        menu={contextMenu}
        onDelete={handleDelete}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}
