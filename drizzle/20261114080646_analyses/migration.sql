CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"movie_id" integer NOT NULL CONSTRAINT "analyses_movie_id_unique_idx" UNIQUE,
	"text" text NOT NULL,
	"submitted_at" timestamp NOT NULL,
	"edited_at" timestamp NOT NULL,
	"grade" integer,
	"remark" text,
	"graded_at" timestamp,
	CONSTRAINT "analyses_grade_range" CHECK ("grade" between -1 and 10),
	CONSTRAINT "analyses_grade_with_graded_at" CHECK (("grade" is null) = ("graded_at" is null)),
	CONSTRAINT "analyses_remark_needs_grade" CHECK ("remark" is null or "grade" is not null)
);
