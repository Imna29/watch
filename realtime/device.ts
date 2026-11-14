/**
 * A device's realtime system: the connection plus every feature's device
 * module. Used by the browser plugin (`plugins/realtime.client.ts`) and by
 * the seam 1 test harness, so both run the same thing. A new feature adds
 * its device module here.
 */
import { createDeviceCall } from "./call/device";
import type { CallPlatform } from "./call/platform";
import { createDeviceClient, type DeviceClientOptions } from "./deviceClient";
import { createDevicePresence } from "./presence/device";
import { createDeviceWatchParty } from "./watchParty/device";
import { createDeviceTabShare } from "./watchParty/tabShareDevice";

export interface RealtimeDeviceOptions extends DeviceClientOptions {
  /** The browser's media and WebRTC, for the Call. */
  call: CallPlatform;
}

export function createRealtimeDevice({ call: platform, ...options }: RealtimeDeviceOptions) {
  const client = createDeviceClient(options);
  const watchParty = createDeviceWatchParty(client);
  const call = createDeviceCall(client, platform, options.clock);
  return {
    client,
    presence: createDevicePresence(client),
    watchParty,
    call,
    /** Tab Share: the Watch Party shared over the Call. */
    tabShare: createDeviceTabShare({ client, watchParty, call, clock: options.clock }),
  };
}

export type RealtimeDevice = ReturnType<typeof createRealtimeDevice>;
