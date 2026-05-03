import KioskApp from '@/components/Kiosk/KioskApp';

export const metadata = {
  title: 'HUCM CME Kiosk',
  description: 'Biometric Attendance Logging',
};

export default function KioskPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#097C87] to-[#04434a] flex flex-col items-center justify-center p-3 sm:p-6 text-white font-sans overflow-hidden">
        <div className="absolute inset-0 bg-[#097C87] bg-opacity-10 backdrop-blur-md z-0 pointer-events-none" />
        <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto hide-scrollbar flex flex-col items-center">
            <div className="w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white/10 backdrop-blur-sm p-4 sm:p-6 rounded-2xl border border-white/20 shadow-2xl mb-6 sm:mb-8">
                <div className="flex items-center gap-3 sm:gap-6">
                   <img src="/images/hucm_logo.png" alt="HUCM Seal" className="w-[50px] h-[50px] sm:w-[80px] sm:h-[80px] filter drop-shadow-md brightness-110 object-contain mix-blend-screen flex-shrink-0" />
                   <div>
                       <h1 className="text-base sm:text-2xl font-bold font-serif leading-tight text-white drop-shadow-md">Howard University College of Medicine</h1>
                       <p className="text-xs sm:text-lg font-semibold text-slate-200">Office of Faculty Development and JEDI</p>
                       <p className="text-[10px] sm:text-sm text-white/80 font-mono mt-1">OFD Programming Registration Kiosk</p>
                   </div>
                </div>
                <div className="flex flex-col items-start sm:items-end">
                    <h2 className="text-sm sm:text-xl font-bold bg-white/20 px-3 sm:px-4 py-1 border border-white/30 rounded-lg">Active Session Kiosk</h2>
                    <p className="text-xs sm:text-md text-white/80 mt-2 tracking-wide font-medium">Auto-Sync Data Link: ONLINE</p>
                </div>
            </div>

            <KioskApp />
        </div>
    </div>
  );
}
