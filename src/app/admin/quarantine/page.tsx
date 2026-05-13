import QuarantineClient from './QuarantineClient';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

// Server component just renders the client island. All data fetching
// happens in the client so we can refetch after each adjudication.
export default function QuarantinePage() {
  return <QuarantineClient />;
}
