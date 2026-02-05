import type Genre from "./Genre";
import type ProductionCompany from "./ProductionCompany";
import type ProductionCountry from "./ProductionCountry";
import type SpokenLanguage from "./SpokenLanguage";
import type { VideoResultsResponse } from "./Video";

export interface Movie {
  backdrop_path: string;
  id: number;
  original_title: string;
  overview: string;
  poster_path: string;
  media_type: string;
  adult: boolean;
  title: string;
  original_language: string;
  genre_ids: number[];
  popularity: number;
  release_date: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
}

export interface MovieOrTvResult {
  backdrop_path: string;
  id: number;
  original_title?: string;
  overview: string;
  poster_path: string;
  media_type: string;
  adult: boolean;
  title?: string;
  original_language: string;
  genre_ids: number[];
  popularity: number;
  release_date?: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
  original_name?: string;
  name?: string;
  first_air_date?: string;
  origin_country?: string[];
}

export interface MovieOrTvResponse {
  page: number;
  results: MovieOrTvResult[];
  total_pages: number;
  total_results: number;
}

export interface MovieResponse {
  page: number;
  results: Movie[];
  total_pages: number;
  total_results: number;
}

export interface GenreResponse {
  genres: Genre[];
}

export interface MovieDetails {
  adult: boolean;
  backdrop_path: string;
  belongs_to_collection: null | any; // Adjust the type if the collection object structure is known
  budget: number;
  genres: Genre[];
  homepage: string;
  id: number;
  imdb_id: string;
  origin_country: string[];
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  release_date: string;
  revenue: number;
  runtime: number;
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
  videos?: VideoResultsResponse;
  similar?: MovieResponse;
  recommendations?: MovieResponse;
}
