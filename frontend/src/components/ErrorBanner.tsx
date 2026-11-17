// The error banner for an action that failed (400, 409, 422): the server message next to the
// form or action. Keep the values that the user typed.
export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="my-2.5 rounded-[10px] bg-[#ffecef] p-3 text-[13px] text-[#9b1c2e]">
      {message}
    </div>
  );
}
