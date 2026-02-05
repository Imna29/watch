import type Creator from "./Creator";
import type Episode from "./Episode";
import type Genre from "./Genre";
import type Network from "./Network";
import type ProductionCompany from "./ProductionCompany";
import type ProductionCountry from "./ProductionCountry";
import type Season from "./Season";
import type SpokenLanguage from "./SpokenLanguage";
import type { VideoResult, VideoResultsResponse } from "./Video";

export interface TVShowsResponse {
  page: number;
  results: TVShow[];
  total_pages: number;
  total_results: number;
}

export interface TVShow {
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  id: number;
  origin_country: string[];
  original_language: string;
  original_name: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  first_air_date: string;
  name: string;
  vote_average: number;
  vote_count: number;
  media_type: string;
}

export interface TVShowDetails {
  adult: boolean;
  backdrop_path: string;
  created_by: Creator[];
  episode_run_time: number[];
  first_air_date: string;
  genres: Genre[];
  homepage: string;
  id: number;
  in_production: boolean;
  languages: string[];
  last_air_date: string;
  last_episode_to_air: Episode;
  name: string;
  next_episode_to_air: Episode;
  networks: Network[];
  number_of_episodes: number;
  number_of_seasons: number;
  origin_country: string[];
  original_language: string;
  original_name: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  seasons: Season[];
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string;
  type: string;
  vote_average: number;
  vote_count: number;
  videos: VideoResultsResponse;
  similar: TVShowsResponse;
  recommendations: TVShowsResponse;
}
