// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

vi.mock("server-only", () => ({}));

const { mockGet, mockSet, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
  })),
}));

import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { createSession, getSession, deleteSession, verifySession } from "@/lib/auth";

const TEST_SECRET = new TextEncoder().encode("development-secret-key");

async function signToken(payload: object, expiresIn = "7d") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(TEST_SECRET);
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("createSession sets a cookie named auth-token", async () => {
  await createSession("user-1", "test@example.com");

  expect(mockSet).toHaveBeenCalledOnce();
  const [name] = mockSet.mock.calls[0];
  expect(name).toBe("auth-token");
});

test("createSession sets cookie with correct options", async () => {
  await createSession("user-1", "test@example.com");

  const [, , options] = mockSet.mock.calls[0];
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
  expect(options.expires).toBeInstanceOf(Date);
});

test("createSession sets secure=false outside production", async () => {
  vi.stubEnv("NODE_ENV", "development");
  await createSession("user-1", "test@example.com");

  const [, , options] = mockSet.mock.calls[0];
  expect(options.secure).toBe(false);
  vi.unstubAllEnvs();
});

test("createSession sets secure=true in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await createSession("user-1", "test@example.com");

  const [, , options] = mockSet.mock.calls[0];
  expect(options.secure).toBe(true);
  vi.unstubAllEnvs();
});

test("createSession cookie expires ~7 days from now", async () => {
  const before = Date.now();
  await createSession("user-1", "test@example.com");
  const after = Date.now();

  const [, , options] = mockSet.mock.calls[0];
  const expiresMs = options.expires.getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays - 1000);
  expect(expiresMs).toBeLessThanOrEqual(after + sevenDays + 1000);
});

test("createSession sets a valid JWT token", async () => {
  await createSession("user-1", "test@example.com");

  const [, token] = mockSet.mock.calls[0];
  expect(token.split(".")).toHaveLength(3);

  const { payload } = await jwtVerify(token, TEST_SECRET);
  expect(payload.userId).toBe("user-1");
  expect(payload.email).toBe("test@example.com");
});

test("createSession JWT uses HS256 algorithm", async () => {
  await createSession("user-1", "test@example.com");

  const [, token] = mockSet.mock.calls[0];
  const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
  expect(header.alg).toBe("HS256");
});

test("createSession JWT includes expiresAt in payload", async () => {
  await createSession("user-1", "test@example.com");

  const [, token] = mockSet.mock.calls[0];
  const { payload } = await jwtVerify(token, TEST_SECRET);
  expect(payload.expiresAt).toBeDefined();
});

// getSession

test("getSession returns null when cookie value is empty", async () => {
  mockGet.mockReturnValue({ value: "" });
  expect(await getSession()).toBeNull();
});

test("getSession returns null when cookie is absent", async () => {
  mockGet.mockReturnValue(undefined);
  expect(await getSession()).toBeNull();
});

test("getSession returns session payload for a valid token", async () => {
  const token = await signToken({ userId: "user-1", email: "test@example.com" });
  mockGet.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session?.userId).toBe("user-1");
  expect(session?.email).toBe("test@example.com");
});

test("getSession returns null for a tampered token", async () => {
  mockGet.mockReturnValue({ value: "invalid.token.value" });
  expect(await getSession()).toBeNull();
});

test("getSession returns null for a token signed with wrong secret", async () => {
  const wrongSecret = new TextEncoder().encode("wrong-secret");
  const token = await new SignJWT({ userId: "user-1", email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(wrongSecret);
  mockGet.mockReturnValue({ value: token });
  expect(await getSession()).toBeNull();
});

test("getSession returns null for an expired token", async () => {
  const token = await signToken({ userId: "user-1", email: "test@example.com" }, "-1s");
  mockGet.mockReturnValue({ value: token });
  expect(await getSession()).toBeNull();
});

// deleteSession

test("deleteSession removes the auth-token cookie", async () => {
  await deleteSession();
  expect(mockDelete).toHaveBeenCalledOnce();
  expect(mockDelete).toHaveBeenCalledWith("auth-token");
});

test("deleteSession does not set or get any cookie", async () => {
  await deleteSession();
  expect(mockSet).not.toHaveBeenCalled();
  expect(mockGet).not.toHaveBeenCalled();
});

// verifySession

test("verifySession returns null when no cookie on request", async () => {
  const req = new NextRequest("http://localhost/");
  expect(await verifySession(req)).toBeNull();
});

test("verifySession returns session payload for a valid token", async () => {
  const token = await signToken({ userId: "user-2", email: "another@example.com" });
  const req = new NextRequest("http://localhost/", {
    headers: { Cookie: `auth-token=${token}` },
  });

  const session = await verifySession(req);
  expect(session?.userId).toBe("user-2");
  expect(session?.email).toBe("another@example.com");
});

test("verifySession returns null for a tampered token", async () => {
  const req = new NextRequest("http://localhost/", {
    headers: { Cookie: "auth-token=bad.token.value" },
  });
  expect(await verifySession(req)).toBeNull();
});

test("verifySession returns null for a token signed with wrong secret", async () => {
  const wrongSecret = new TextEncoder().encode("wrong-secret");
  const token = await new SignJWT({ userId: "user-1", email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(wrongSecret);
  const req = new NextRequest("http://localhost/", {
    headers: { Cookie: `auth-token=${token}` },
  });
  expect(await verifySession(req)).toBeNull();
});

test("verifySession returns full session payload fields", async () => {
  const token = await signToken({ userId: "user-3", email: "full@example.com", expiresAt: new Date() });
  const req = new NextRequest("http://localhost/", {
    headers: { Cookie: `auth-token=${token}` },
  });

  const session = await verifySession(req);
  expect(session).toMatchObject({ userId: "user-3", email: "full@example.com" });
});

test("verifySession ignores cookies other than auth-token", async () => {
  const req = new NextRequest("http://localhost/", {
    headers: { Cookie: "other-cookie=somevalue" },
  });
  expect(await verifySession(req)).toBeNull();
});

test("verifySession returns null for an expired token", async () => {
  const token = await signToken({ userId: "user-1", email: "test@example.com" }, "-1s");
  const req = new NextRequest("http://localhost/", {
    headers: { Cookie: `auth-token=${token}` },
  });
  expect(await verifySession(req)).toBeNull();
});
