import { useEffect, useRef } from 'react';
import styles from './ContextMenu.module.css';

export default function ContextMenu({ menu, onDelete, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!menu) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <ul
      ref={ref}
      className={styles.menu}
      style={{ top: menu.y, left: menu.x }}
    >
      <li onClick={() => { onDelete(menu.taskId); onClose(); }}>删除</li>
    </ul>
  );
}
