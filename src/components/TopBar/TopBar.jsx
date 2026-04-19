import { useState, useEffect } from 'react';
import styles from './TopBar.module.css';

export default function TopBar({ wsClient, onBroadcast, isMasterActive }) {
  const [wsStatus, setWsStatus] = useState('connecting');

  useEffect(() => {
    if (!wsClient) return;
    return wsClient.onStatus(setWsStatus);
  }, [wsClient]);

  return (
    <header className={styles.topbar}>
      <span className={styles.title}>控制台</span>
      <div className={styles.batchBtns}>
        <button className={styles.batchBtn} disabled={!isMasterActive} onClick={() => onBroadcast?.('start')}>批量开始</button>
        <button className={styles.batchBtn} disabled={!isMasterActive} onClick={() => onBroadcast?.('pause')}>批量暂停</button>
      </div>
      <span className={styles.wsIndicator} data-status={wsStatus} title={`WS: ${wsStatus}`} />
    </header>
  );
}
