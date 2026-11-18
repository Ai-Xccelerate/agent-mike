// Only used by `npm run test:skew` (vitest.skew.config.ts).
//
// Shifts this process's clock by SKEW_MS to imitate a database whose clock differs from the server's. A test that sets a
// time with `new Date()` and has the database read it back (or the other way round) passes on a machine whose clocks agree
// and fails when they drift, which is how Docker's clock behaves after the host sleeps or stalls. Postgres keeps real time.
import { vi } from "vitest";

const offset = Number(process.env.SKEW_MS || 0);
if (offset) vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + offset, shouldAdvanceTime: true });
