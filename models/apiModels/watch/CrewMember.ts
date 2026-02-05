import type Person from "./Person";

export default interface CrewMember extends Person {
    credit_id: string;
    department: string;
    job: string;
  }