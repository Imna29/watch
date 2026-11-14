/**
 * The Call, on the server: who is in it, on which device, and relaying
 * WebRTC setup between the two Viewers' Call devices. Media never passes
 * through the server: the two devices connect peer-to-peer (or through the
 * TURN relay). Independent of any Watch Party.
 *
 * Each Viewer is in the Call on at most one device, their Call device. The
 * two Call devices are joined by a link: one peer connection, named by an
 * id that changes whenever the pair of devices changes. Setup messages are
 * relayed only within the current link, so a device that was taken over or
 * reconnected never receives (or disturbs) another connection's setup.
 */
import { z } from "zod";
import { otherViewer, VIEWERS, type Viewer } from "../../models/Viewer";
import type { Device, FeatureFactory } from "../coordinator";
import type { DeviceId } from "../protocol";
import type {
  CallJoinMessage,
  CallLeaveMessage,
  CallMedia,
  CallMediaMessage,
  CallMessage,
  CallRelinkMessage,
  CallSignalMessage,
} from "./protocol";

/** The Viewer whose Call device makes the offer on every link. */
const OFFERER: Viewer = VIEWERS[0];

const mediaSchema = z.object({ mic: z.boolean(), camera: z.boolean() });

const joinSchema = z.object({
  type: z.literal("call:join"),
  joinId: z.string().min(1).max(200),
  media: mediaSchema,
  takeOver: z.boolean(),
}) satisfies z.ZodType<CallJoinMessage>;

const leaveSchema = z.object({ type: z.literal("call:leave") }) satisfies z.ZodType<CallLeaveMessage>;

const mediaMessageSchema = z.object({
  type: z.literal("call:media"),
  media: mediaSchema,
}) satisfies z.ZodType<CallMediaMessage>;

const relinkSchema = z.object({
  type: z.literal("call:relink"),
  link: z.string().max(200),
}) satisfies z.ZodType<CallRelinkMessage>;

const signalSchema = z.object({
  type: z.literal("call:signal"),
  link: z.string().max(200),
  signal: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("description"),
      description: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().max(100_000) }),
    }),
    z.object({
      kind: z.literal("candidate"),
      candidate: z.object({
        candidate: z.string().max(2000),
        sdpMid: z.string().max(200).nullish(),
        sdpMLineIndex: z.number().int().min(0).max(1000).nullish(),
        usernameFragment: z.string().max(200).nullish(),
      }),
    }),
  ]),
}) satisfies z.ZodType<CallSignalMessage>;

/** A Viewer's place in the Call. */
interface Seat {
  joinId: string;
  /** The Viewer's Call device; null while it is disconnected. */
  device: DeviceId | null;
  /** When `device` disconnected. */
  awaySince: number;
  media: CallMedia;
}

interface Link {
  id: string;
  devices: Record<Viewer, DeviceId>;
}

export interface CallOptions {
  /**
   * How long a Viewer whose Call device disconnected stays in the Call, so
   * the device can reconnect and rejoin without the other Viewer seeing them
   * leave. A device can rejoin after this too, as long as no other device of
   * its Viewer took the Call over.
   */
  rejoinGraceMs?: number;
}

export function call({ rejoinGraceMs = 10_000 }: CallOptions = {}): FeatureFactory {
  return (context) => {
    const seats = new Map<Viewer, Seat>();
    let link: Link | null = null;
    let linkCount = 0;
    /** The last state each device was sent, as JSON, to send only changes. */
    const lastSent = new Map<DeviceId, string>();

    function isCallDevice(device: Device) {
      return seats.get(device.viewer)?.device === device.id;
    }

    /** Keeps the link while the same two devices are in the Call; a new pair gets a new link. */
    function updateLink() {
      const giorgi = seats.get("giorgi")?.device;
      const mariam = seats.get("mariam")?.device;
      if (!giorgi || !mariam) {
        link = null;
      } else if (link?.devices.giorgi !== giorgi || link.devices.mariam !== mariam) {
        link = { id: `${context.now().toString(36)}-${++linkCount}`, devices: { giorgi, mariam } };
      }
    }

    function stateFor(device: Device): CallMessage {
      const seat = seats.get(device.viewer);
      const here = seat?.device === device.id;
      return {
        type: "call",
        viewers: Object.fromEntries(
          VIEWERS.map((viewer) => [viewer, seats.get(viewer)?.media ?? null]),
        ) as Record<Viewer, CallMedia | null>,
        joinId: here ? seat.joinId : null,
        link: here && link ? { id: link.id, offerer: device.viewer === OFFERER } : null,
      };
    }

    /** Tells every device whose view of the Call changed; `newDevice` hears it regardless. */
    function share(newDevice?: Device) {
      updateLink();
      for (const device of context.devices()) {
        const message = stateFor(device);
        const text = JSON.stringify(message);
        if (text === lastSent.get(device.id) && device.id !== newDevice?.id) continue;
        lastSent.set(device.id, text);
        context.send(device.id, message);
      }
    }

    return {
      handlers: {
        "call:join": {
          schema: joinSchema,
          handle(from, { joinId, media, takeOver }) {
            const seat = seats.get(from.viewer);
            if (!takeOver && seat && seat.joinId !== joinId) {
              // A reconnected device, but the Viewer joined from another one meanwhile.
              context.send(from.id, { type: "call:continued-elsewhere", joinId });
              return;
            }
            if (seat?.device && seat.device !== from.id && seat.joinId !== joinId) {
              context.send(seat.device, { type: "call:continued-elsewhere", joinId: seat.joinId });
            }
            seats.set(from.viewer, { joinId, device: from.id, awaySince: 0, media });
            share();
          },
        },
        "call:leave": {
          schema: leaveSchema,
          handle(from) {
            if (!isCallDevice(from)) return;
            seats.delete(from.viewer);
            share();
          },
        },
        "call:media": {
          schema: mediaMessageSchema,
          handle(from, { media }) {
            const seat = seats.get(from.viewer);
            if (!seat || !isCallDevice(from)) return;
            seat.media = media;
            share();
          },
        },
        "call:relink": {
          schema: relinkSchema,
          handle(from, { link: linkId }) {
            if (!isCallDevice(from) || link?.id !== linkId) return;
            link = null;
            share();
          },
        },
        "call:signal": {
          schema: signalSchema,
          handle(from, { link: linkId, signal }) {
            if (!isCallDevice(from) || !link || link.id !== linkId) return;
            context.send(link.devices[otherViewer(from.viewer)], { type: "call:signal", link: link.id, signal });
          },
        },
      },
      connected(device) {
        share(device);
      },
      disconnected(device) {
        lastSent.delete(device.id);
        const seat = seats.get(device.viewer);
        if (seat?.device !== device.id) return;
        // Still in the Call for a while, in case the device reconnects and rejoins.
        seat.device = null;
        seat.awaySince = context.now();
        share();
      },
      tick() {
        let changed = false;
        for (const [viewer, seat] of seats) {
          if (seat.device === null && context.now() - seat.awaySince >= rejoinGraceMs) {
            seats.delete(viewer);
            changed = true;
          }
        }
        if (changed) share();
      },
    };
  };
}
