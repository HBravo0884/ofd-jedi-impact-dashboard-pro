import KioskApp from '@/components/Kiosk/KioskApp';

export const metadata = {
  title: 'HUCM CME Kiosk',
  description: 'Programming Registration Kiosk',
};

// Public page (no admin cookie required) — this is the iPad sign-in screen.
// All styling and screen-state logic live in KioskApp; the page is just the
// React entry point.
export default function KioskPage() {
  return <KioskApp />;
}
