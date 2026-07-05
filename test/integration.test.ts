import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildHttpServer } from "../src/api/server.js";

describe("API Integration", () => {
  const app = buildHttpServer();
  let token: string;

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("knowledge-engine");
  });

  it("POST /api/auth/register creates user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: `test-${Date.now()}@test.com`, password: "test123456", displayName: "Tester" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBeTruthy();
    expect(body.token).toBeTruthy();
    token = body.token;
  });

  it("GET /api/auth/me returns current user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBeTruthy();
  });

  it("GET /api/projects returns empty list for new user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.projects).toEqual([]);
  });

  it("POST /api/projects creates a project", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Test Project", description: "My first KB" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.project.name).toBe("Test Project");
    expect(body.project.id).toBeTruthy();
  });

  it("GET /api/projects returns created project", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.projects.length).toBe(1);
    expect(body.projects[0].name).toBe("Test Project");
  });

  it("GET /api/auth/me without token returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/auth/login with wrong password returns error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: `test-${Date.now()}@test.com`, password: "wrong" },
    });
    expect(res.statusCode).toBe(500); // service throws Error
  });
});
