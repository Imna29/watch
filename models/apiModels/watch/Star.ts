import type Person from "./Person";

export default interface Star extends Person {
  character: string;
  credit_id: string;
  order: number;
}

export interface GuestStar extends Person {
  character: string;
  credit_id: string;
  order: number;
}
