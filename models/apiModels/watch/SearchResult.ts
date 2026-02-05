import type { Movie } from "./MovieModels";
import type Person from "./Person";
import type { TVShow } from "./TvModels";

export interface PersonResult extends Person {
    media_type: 'person';
    known_for: Array<Movie | TVShow>;
}

export interface SearchResponse {
    page: number;
    results: Array<Movie | TVShow | PersonResult>;
    total_pages: number;
    total_results: number;
  }