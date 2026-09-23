import { defineRailway, github, postgres, project, service } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("Postgres");

  const fBJava = service("fB-java", {
    source: github("ksdhruvateja/fB-java", { checkSuites: false, branch: "main" }),
    start: "node server.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "fb-java" },
  });

  return project("sublime-optimism", {
    resources: [db, fBJava],
  });
});
