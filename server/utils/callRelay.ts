import { createCallRelay, type CallRelay } from "../call/relay";

let callRelay: CallRelay | undefined;

/**
 * The process-wide Call relay config (`server/call/relay.ts`), read from
 * server config on first use (`server/plugins/call-relay.ts` reads it at
 * startup).
 */
export function useCallRelay() {
  callRelay ??= createCallRelay({ env: process.env });
  return callRelay;
}
