import type CrewMember from "./CrewMember";
import type Star from "./Star";

export default interface Credits {
    id: number,
    cast: Star[],
    crew: CrewMember[]
}
