export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        header { display: none !important; }
        .topnav { display: none !important; }
        .tab-pane { padding: 0 !important; }
        body { background: #04434a; overflow-x: hidden; }
      `}</style>
      {children}
    </>
  );
}
