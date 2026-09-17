/**
 * Stand-in for `@supabase/realtime-js`, aliased in at build time.
 *
 * WHY THIS EXISTS. `@supabase/realtime-js` and its transport dependency
 * `@supabase/phoenix` are 145 KB of source — 4.9% of the main bundle — and this
 * app opens no channels at all. There is no `.channel(`, no
 * `postgres_changes` and no `.subscribe()` anywhere in `src/`. Every live
 * number in StormSync is polled through TanStack Query with an explicit
 * `refetchInterval`, which is the right shape for feeds that publish on a
 * schedule (NWS, SPC, Open-Meteo) rather than pushing.
 *
 * It cannot be tree-shaken away. `createClient()` constructs a `RealtimeClient`
 * unconditionally in the `SupabaseClient` constructor, so the import is live
 * whether or not a channel is ever opened, and no bundler may drop it.
 *
 * Measured on the production build: the main chunk goes from 274,550 to
 * 258,232 bytes gzipped. 16,318 bytes off the critical path of every first
 * visit, for no behaviour change.
 *
 * IF YOU EVER ADD REALTIME, delete the `@supabase/realtime-js` alias in
 * `vite.config.ts` and this file with it. `channel()` throws rather than
 * returning a dead object so that mistake surfaces immediately and loudly at
 * the call site, instead of silently never delivering a message.
 */

const NOT_BUNDLED =
  "Supabase Realtime is not bundled in this app. Remove the " +
  "'@supabase/realtime-js' alias in vite.config.ts to use channels.";

export class RealtimeClient {
  // The real client is constructed by SupabaseClient with (url, options).
  // Accepting and ignoring them keeps construction side-effect free.
  constructor(_url?: string, _options?: unknown) {}

  channel(): never {
    throw new Error(NOT_BUNDLED);
  }

  // The teardown paths run on sign-out and client disposal, so they have to
  // exist and be harmless — throwing here would break logout, which has
  // nothing to do with Realtime.
  removeChannel(): Promise<"ok"> {
    return Promise.resolve("ok");
  }
  removeAllChannels(): Promise<"ok"[]> {
    return Promise.resolve([]);
  }
  getChannels(): never[] {
    return [];
  }
  connect(): void {}
  disconnect(): void {}
  setAuth(_token?: string | null): Promise<void> {
    return Promise.resolve();
  }
}

export class RealtimeChannel {}
export class RealtimePresence {}

export const REALTIME_LISTEN_TYPES = {} as const;
export const REALTIME_SUBSCRIBE_STATES = {} as const;
export const REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {} as const;
export const REALTIME_CHANNEL_STATES = {} as const;

export default RealtimeClient;
