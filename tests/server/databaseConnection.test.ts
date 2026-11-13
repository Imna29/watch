import { describe, expect, it } from "vitest";
import { postgresConnectionOptions } from "../../server/database/connection";

const LOCAL_DOCKER_ENV = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "5432",
  DB_USER: "watch",
  DB_PASSWORD: "watch",
  DB_NAME: "watch",
};

describe("postgresConnectionOptions", () => {
  it("connects to the local Docker Postgres without SSL when no CA certificate is configured", () => {
    expect(postgresConnectionOptions(LOCAL_DOCKER_ENV)).toEqual({
      host: "127.0.0.1",
      port: 5432,
      user: "watch",
      password: "watch",
      database: "watch",
      ssl: false,
    });
  });

  it("treats the empty DB_CA from .env.example as no CA certificate", () => {
    expect(postgresConnectionOptions({ ...LOCAL_DOCKER_ENV, DB_CA: "" }).ssl).toBe(false);
  });

  it("uses SSL and verifies the server against the CA certificate when one is configured", () => {
    const ca = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    expect(postgresConnectionOptions({ ...LOCAL_DOCKER_ENV, DB_CA: ca }).ssl).toEqual({
      ca,
      rejectUnauthorized: true,
    });
  });
});
