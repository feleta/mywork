import styles from './Sidebar.module.css';

export default function TaskIcon({ task, isActive, onClick, onContextMenu }) {
  const isMaster = task.role === 'master';

  return (
    <div
      className={[styles.icon, isActive ? styles.active : '', isMaster ? styles.master : ''].join(' ')}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, task.id); }}
      title={`${task.label}${isMaster ? ' (主任务)' : ''}`}
    >
      {isMaster && <span className={styles.crown}>★</span>}
      <span className={styles.iconLabel}>{task.label}</span>
    </div>
  );
}
