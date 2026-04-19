import TaskIcon from './TaskIcon';
import styles from './Sidebar.module.css';

export default function Sidebar({ tasks, activeTaskId, onSelect, onAdd, onContextMenu }) {
  return (
    <aside className={styles.sidebar}>
      <button className={styles.addBtn} onClick={onAdd} title="新建子任务">+</button>

      <div className={styles.divider} />

      {tasks.map(task => (
        <TaskIcon
          key={task.id}
          task={task}
          isActive={task.id === activeTaskId}
          onClick={() => onSelect(task.id)}
          onContextMenu={onContextMenu}
        />
      ))}
    </aside>
  );
}
