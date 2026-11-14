/**
 * A device's realtime system: the connection plus every feature's device
 * module. Used by the browser plugin (`plugins/realtime.client.ts`) and by
 * the seam 1 test harness, so both run the same thing. A new feature adds
 * its device module here.
 */
import { createDeviceClient, type DeviceClientOptions } from "./deviceClient";
import { createDevicePresence } from "./presence/device";
import { createDeviceWatchParty } from "./watchParty/device";

export function createRealtimeDevice(options: DeviceClientOptions) {
  const client = createDeviceClient(options);
  return {
    client,
    presence: createDevicePresence(client),
    watchParty: createDeviceWatchParty(client),
  };
}

export type RealtimeDevice = ReturnType<typeof createRealtimeDevice>;
