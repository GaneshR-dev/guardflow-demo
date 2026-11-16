# Sequential shift recovery

Do not restore an application version that assumes one attendance row per employee and day.
Do not restore the old unique constraint. Do not delete or combine shift rows.

## Pause additional shifts

Set `ALLOW_SEQUENTIAL_SHIFTS=false` in the deployment environment, then restart the current release.
This stops new second and later shifts. It keeps first check-ins, check-outs, reports, exports, and record-specific time edits available.
Existing duties stay open until the supervisor checks them out. This switch never edits attendance history.
The default is `true`. Remove the override after the repair passes tests.

If hosting settings cannot be reached, deploy this release with the switch default changed to `false`.
Keep the current multi-record read and edit code. Do not deploy old code as a recovery step.

## Migration failure

PostgreSQL startup migrations use one transaction and a transaction-scoped startup lock.
A later migration failure rolls back the removed unique constraint and preserves every attendance row.
Fix the cause and retry the same release. A second successful migration is a no-op.
The migration and forced-failure rollback are tested against isolated PostgreSQL.

## Verify recovery

1. Read health and the deployed asset version.
2. Compare existing attendance record IDs, timestamps, status, and location with the pre-release capture.
3. Verify that the existing overnight duty remains open with its original check-in time.
4. Check the monthly report and Excel export. Each completed shift must remain a separate record with its own hours.
5. Confirm that a second-shift request returns a clear paused message and writes no attendance record.
6. Test the repair on isolated data before enabling additional shifts again.

A database restore loses records created after the backup. Do not restore a snapshot over current attendance as a routine recovery.
