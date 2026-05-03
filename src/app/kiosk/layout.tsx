export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        body > header,
        .topnav,
        #tab-overview > .tab-pane { display: none !important; }
        #tab-overview { padding: 0 !important; }
        body { background: #04434a; }
      `}</style>
      {children}
    </>
  );
}
