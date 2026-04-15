import styles from './StatCard.module.css';

interface StatCardProps {
  title: string;
  subtitle?: string;
  value: string | number;
  colorIndex?: number; // 1, 2, 3, or 5 (for c1, c2, c3, c5)
}

export default function StatCard({ title, subtitle, value, colorIndex = 1 }: StatCardProps) {
  // Map index to the color variables matching the CSS
  let borderClass = styles.borderC1;
  let textClass = styles.textC1;
  
  if (colorIndex === 2) { borderClass = styles.borderC2; textClass = styles.textC2; }
  else if (colorIndex === 3) { borderClass = styles.borderC3; textClass = styles.textC3; }
  else if (colorIndex === 5) { borderClass = styles.borderC5; textClass = styles.textC5; }

  return (
    <div className={`${styles.kpiCard} ${borderClass}`}>
      <div className={`${styles.kpiNum} ${textClass}`}>{value}</div>
      <div className={styles.kpiLabel}>{title}</div>
      {subtitle && <div className={styles.kpiSub}>{subtitle}</div>}
    </div>
  );
}
