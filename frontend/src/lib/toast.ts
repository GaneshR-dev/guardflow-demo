import { toast as sonner } from 'sonner';

// Confirm a finished action: saved, checked in, checked out, downloaded.
// Do not use a toast for a failure that stops the user, or when a screen only loads data.
export const toast = (text: string) => sonner(text, { duration: 2400 });
