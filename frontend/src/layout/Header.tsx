import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { selectCompany, useSession } from '@/auth/session';

// Top bar: the brand word. The owner also sees the company they manage.
export function Header() {
  const session = useSession();
  const navigate = useNavigate();
  const isOwner = session.user?.role === 'owner';
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between">
      <span className="text-[13px] font-extrabold tracking-[0.2px] text-navy">Guardian</span>
      {isOwner && (
        <span className="mt-2 flex basis-full flex-wrap items-center justify-between gap-2.5 text-sm">
          {session.companyId ? (
            <>
              <span>
                Managing: <b>{session.companyName || 'selected company'}</b>
              </span>
              <Button
                variant="link"
                className="h-11 px-0"
                onClick={() => {
                  selectCompany('');
                  navigate('/owner');
                }}
              >
                Switch company
              </Button>
            </>
          ) : (
            'Owner'
          )}
        </span>
      )}
    </div>
  );
}
