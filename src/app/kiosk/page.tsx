import KioskApp from '@/components/Kiosk/KioskApp';

export const metadata = {
  title: 'HUCM CME Kiosk',
  description: 'Biometric Attendance Logging',
};

export default function KioskPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#097C87] to-[#04434a] flex flex-col items-center justify-center p-6 text-white font-sans overflow-hidden">
        {/* Full-bleed application bounding box */}
        <div className="absolute inset-0 bg-[#097C87] bg-opacity-10 backdrop-blur-md z-0 pointer-events-none" />
        <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto hide-scrollbar flex flex-col items-center">
            <div className="w-full flex justify-between items-center bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/20 shadow-2xl mb-8">
                <div className="flex items-center gap-6">
                   <img src="/images/hucm_logo.png" alt="HUCM Seal" className="w-[80px] h-[80px] filter drop-shadow-md brightness-110 object-contain mix-blend-screen" onError={(e) => e.currentTarget.style.display = 'none'} />
                   <div>
                       <h1 className="text-2xl font-bold font-serif leading-tight text-white drop-shadow-md">Howard University College of Medicine</h1>
                       <p className="text-lg font-semibold text-slate-200">Office of Faculty Development and JEDI</p>
                       <p className="text-sm text-white/80 font-mono mt-1">OFD Programming Registration Kiosk</p>
                   </div>
                </div>
                <div className="text-right flex flex-col items-end">
                    <h2 className="text-xl font-bold bg-white/20 px-4 py-1 border border-white/30 rounded-lg">Active Session Kiosk</h2>
                    <p className="text-md text-white/80 mt-2 tracking-wide font-medium">Auto-Sync Data Link: ONLINE</p>
                </div>
            </div>

            <KioskApp />
        </div>
    </div>
  );
}
