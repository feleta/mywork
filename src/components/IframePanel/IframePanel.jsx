import styles from './IframePanel.module.css';

export default function IframePanel({ tasks, activeTaskId }) {
  if (tasks.length === 0) {
    return (
      <main className={styles.panel}>
        <div className={styles.empty}>点击左侧 + 创建任务</div>
      </main>
    );
  }
  return (
    <main className={styles.panel}>
      {tasks.map(task => (
        <iframe
          key={task.id}
          ref={task.iframeRef}
          srcDoc={task.srcdoc}
          className={`${styles.frame} ${task.id === activeTaskId ? styles.active : ''}`}
          title={task.label}
          sandbox="allow-scripts allow-same-origin allow-modals"
        />
      ))}
    </main>
  );
}
