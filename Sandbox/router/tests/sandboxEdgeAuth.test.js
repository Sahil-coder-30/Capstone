// Tests of the owner-only edge check for *.agent and *.preview hosts, with a
// real RSA key pair standing in for Auth and a fake Sandbox server owner lookup.

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import express from "express";
import {
  createAccessTokenVerifier,
  createOwnerLookup,
  createSandboxEdgeAuth,
  sessionCookieName,
  shareCookieName,
  SESSION_PATH,
  SHARE_PATH,
  EdgeAuthError,
} from "../src/sandboxEdgeAuth.js";

const OWNER = "65f0c0ffee0000000000abcd";
const OTHER = "65f0c0ffee0000000000ffff";
const SBX = "sbx-edge";
const SECRET = "session-secret";
const ORIGIN = "http://localhost:5173";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "auth-rsa-v1", alg: "RS256", use: "sig" };
const token = (sub, { aud = "takshacodespace-services", ...claims } = {}) =>
  jwt.sign({ sub, id: sub, ...claims }, privateKey, {
    algorithm: "RS256", keyid: "auth-rsa-v1", issuer: "auth.takshacodespace.in",
    audience: aud, expiresIn: "15m",
  });
const verifyAccessToken = createAccessTokenVerifier({ fetchJwks: async () => ({ keys: [jwk] }) });

let lookups = 0;
const ownerOf = async (id) => { lookups += 1; return id === SBX ? OWNER : null; };

const spent = new Set();
const claimTicket = async (jti) => (spent.has(jti) ? false : (spent.add(jti), true));
const edge = createSandboxEdgeAuth({ verifyAccessToken, ownerOf, secret: SECRET, allowedOrigins: [ORIGIN], claimTicket });
const req = (headers = {}) => ({ headers });
const cookieFor = (value) => `${sessionCookieName(SBX)}=${value}`;

test("owner's bearer token passes; another user's is refused", async () => {
  assert.equal((await edge.authenticate(req({ authorization: `Bearer ${token(OWNER)}` }), SBX)).via, "bearer");
  await assert.rejects(edge.authenticate(req({ authorization: `Bearer ${token(OTHER)}` }), SBX), { status: 403 });
});

test("no credentials is 401, and the owner lookup is not even called", async () => {
  lookups = 0;
  await assert.rejects(edge.authenticate(req(), SBX), { status: 401 });
  assert.equal(lookups, 0);
});

test("sandbox tokens and HS256 tokens are not accepted at the public edge", async () => {
  const sbxToken = token(OWNER, { aud: "taksha-sandbox", sbx: SBX });
  await assert.rejects(edge.authenticate(req({ authorization: `Bearer ${sbxToken}` }), SBX), { status: 401 });
  const hs = jwt.sign({ sub: OWNER }, "shared", { algorithm: "HS256", issuer: "auth.takshacodespace.in", audience: "takshacodespace-services" });
  await assert.rejects(edge.authenticate(req({ authorization: `Bearer ${hs}` }), SBX), { status: 401 });
});

test("a minted cookie passes for its sandbox only, and tampering or expiry fails", async () => {
  const value = edge.mintCookie(SBX, OWNER);
  assert.equal((await edge.authenticate(req({ cookie: `a=b; ${cookieFor(value)}` }), SBX)).via, "cookie");

  // Same cookie presented for another sandbox of the same owner: bound to SBX, so it is ignored.
  const other = createSandboxEdgeAuth({ verifyAccessToken, ownerOf: async () => OWNER, secret: SECRET, allowedOrigins: [] });
  await assert.rejects(other.authenticate(req({ cookie: `${sessionCookieName("sbx-two")}=${value}` }), "sbx-two"), { status: 401 });

  const [payload, mac] = value.split(".");
  const forged = Buffer.from(JSON.stringify({ sbx: SBX, sub: OWNER, exp: 9999999999 })).toString("base64url");
  await assert.rejects(edge.authenticate(req({ cookie: cookieFor(`${forged}.${mac}`) }), SBX), { status: 401 });
  await assert.rejects(edge.authenticate(req({ cookie: cookieFor(`${payload}.AAAA`) }), SBX), { status: 401 });

  const later = createSandboxEdgeAuth({ verifyAccessToken, ownerOf, secret: SECRET, allowedOrigins: [], now: () => Date.now() + 13 * 3600_000 });
  await assert.rejects(later.authenticate(req({ cookie: cookieFor(value) }), SBX), { status: 401 });
});

test("a cookie signed with another secret fails", async () => {
  const foreign = createSandboxEdgeAuth({ verifyAccessToken, ownerOf, secret: "other", allowedOrigins: [] }).mintCookie(SBX, OWNER);
  await assert.rejects(edge.authenticate(req({ cookie: cookieFor(foreign) }), SBX), { status: 401 });
});

test("unknown sandbox is 404; missing secret fails closed with 503", async () => {
  await assert.rejects(edge.authenticate(req({ authorization: `Bearer ${token(OWNER)}` }), "nope"), { status: 404 });
  const noSecret = createSandboxEdgeAuth({ verifyAccessToken, ownerOf, secret: "", allowedOrigins: [] });
  await assert.rejects(noSecret.authenticate(req({ authorization: `Bearer ${token(OWNER)}` }), SBX), { status: 503 });
});

// ── Session route over real HTTP ────────────────────────────────────────────
const app = express();
app.all(SESSION_PATH, (r, s) => edge.sessionRoute(r, s, SBX));
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}${SESSION_PATH}`;

test("session route: owner gets a host-only HttpOnly Secure SameSite=None cookie with CORS for the editor", async () => {
  const res = await fetch(base, { method: "POST", headers: { Authorization: `Bearer ${token(OWNER)}`, Origin: ORIGIN } });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, new RegExp(`^${sessionCookieName(SBX)}=`));
  for (const attr of ["HttpOnly", "Secure", "SameSite=None", "Partitioned", "Path=/", "Max-Age=43200"]) assert.ok(cookie.includes(attr), attr);
  assert.ok(!/Domain=/i.test(cookie), "host-only: no Domain attribute");
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");

  const value = cookie.split(";")[0].split("=")[1];
  assert.equal((await edge.authenticate(req({ cookie: cookieFor(value) }), SBX)).sub, OWNER);
});

test("session route: other user 403, no token 401, unknown origin gets no CORS, preflight 204", async () => {
  assert.equal((await fetch(base, { method: "POST", headers: { Authorization: `Bearer ${token(OTHER)}` } })).status, 403);
  assert.equal((await fetch(base, { method: "POST" })).status, 401);
  const evil = await fetch(base, { method: "POST", headers: { Authorization: `Bearer ${token(OWNER)}`, Origin: "https://evil.example" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  assert.equal((await fetch(base, { method: "OPTIONS", headers: { Origin: ORIGIN } })).status, 204);
  const del = await fetch(base, { method: "DELETE" });
  assert.equal(del.status, 204);
  assert.match(del.headers.get("set-cookie"), /Max-Age=0/);
});

test("new-tab ticket: single use, sets a first-party (not partitioned) cookie, redirects only to a local path", async () => {
  const mint = await fetch(`${base}?ticket`, { method: "POST", headers: { Authorization: `Bearer ${token(OWNER)}` } });
  assert.equal(mint.status, 200);
  const { ticket } = await mint.json();

  const open = await fetch(`${base}?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent("//evil.example/x")}`, { redirect: "manual" });
  assert.equal(open.status, 302);
  assert.equal(open.headers.get("location"), "/", "an open redirect is replaced by /");
  const cookie = open.headers.get("set-cookie");
  assert.ok(cookie.includes("SameSite=None") && !cookie.includes("Partitioned"));

  const again = await fetch(`${base}?ticket=${encodeURIComponent(ticket)}`, { redirect: "manual" });
  assert.equal(again.status, 401, "a ticket works once");

  // A session cookie is not a ticket, and a ticket is not a session cookie.
  const asTicket = await fetch(`${base}?ticket=${encodeURIComponent(edge.mintCookie(SBX, OWNER))}`, { redirect: "manual" });
  assert.equal(asTicket.status, 401);
  await assert.rejects(edge.authenticate(req({ cookie: cookieFor(edge.mintTicket(SBX, OWNER)) }), SBX), { status: 401 });

  const ok = await fetch(`${base}?ticket=${encodeURIComponent((await (await fetch(`${base}?ticket`, { method: "POST", headers: { Authorization: `Bearer ${token(OWNER)}` } })).json()).ticket)}&next=/about?x=1`, { redirect: "manual" });
  assert.equal(ok.headers.get("location"), "/about?x=1");
  server.close();
});

test("owner lookup: asks the Sandbox server once, caches hits, short-caches misses, fails closed without a token", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, token: init.headers["X-Internal-Token"] });
    if (url.endsWith(`/internal/sandboxes/${SBX}/owner`)) return new Response(JSON.stringify({ ownerId: OWNER }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const lookup = createOwnerLookup({ sandboxApiUrl: "http://sandbox-service/", internalToken: "t", fetch: fakeFetch });
  assert.equal(await lookup(SBX), OWNER);
  assert.equal(await lookup(SBX), OWNER);
  assert.equal(await lookup("gone"), null);
  assert.equal(await lookup("gone"), null);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `http://sandbox-service/internal/sandboxes/${SBX}/owner`);
  assert.equal(calls[0].token, "t");

  const noToken = createOwnerLookup({ sandboxApiUrl: "http://x", internalToken: "", fetch: fakeFetch });
  await assert.rejects(noToken(SBX), (err) => err instanceof EdgeAuthError && err.status === 503);
});

// ── Share links: a live preview for somebody without a Taksha login ─────────
// (The WhatsApp bot hands these out; see sandboxEdgeAuth.js.)
const revoked = new Set();
const shareEdge = createSandboxEdgeAuth({
  verifyAccessToken, ownerOf, secret: SECRET, allowedOrigins: [ORIGIN], claimTicket,
  shareRevoked: async (sid) => revoked.has(sid),
  revokeShare: async (sid) => { revoked.add(sid); },
});
const shareApp = express();
shareApp.all(SHARE_PATH, (r, s) => shareEdge.shareRoute(r, s, SBX));
const shareServer = shareApp.listen(0, "127.0.0.1");
await new Promise((r) => shareServer.once("listening", r));
const shareBase = `http://127.0.0.1:${shareServer.address().port}${SHARE_PATH}`;
const shareCookieFor = (value) => `${shareCookieName(SBX)}=${value}`;
const mintVia = async (query = "") =>
  (await (await fetch(`${shareBase}${query}`, { method: "POST", headers: { Authorization: `Bearer ${token(OWNER)}` } })).json());

test("share link: only the owner mints one, and the expiry is clamped to 24 h", async () => {
  assert.equal((await fetch(shareBase, { method: "POST" })).status, 401);
  assert.equal((await fetch(shareBase, { method: "POST", headers: { Authorization: `Bearer ${token(OTHER)}` } })).status, 403);

  const { token: value, sid, expiresIn } = await mintVia();
  assert.ok(sid && value);
  assert.equal(expiresIn, 3600, "one hour by default");
  assert.equal((await mintVia("?ttlSeconds=999999")).expiresIn, 24 * 3600);
  assert.equal((await mintVia("?ttlSeconds=1")).expiresIn, 60, "a floor of a minute");
});

test("share link: opens the preview with no login, and never the agent host", async () => {
  const { token: value } = await mintVia();
  const open = await fetch(`${shareBase}?t=${encodeURIComponent(value)}&next=/pricing`, { redirect: "manual" });
  assert.equal(open.status, 302);
  assert.equal(open.headers.get("location"), "/pricing");
  const cookie = open.headers.get("set-cookie");
  assert.match(cookie, new RegExp(`^${shareCookieName(SBX)}=`));
  for (const attr of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(cookie.includes(attr), attr);
  assert.ok(!/Partitioned/.test(cookie), "a share link is opened top-level, not in the editor's partition");

  const viewer = req({ cookie: shareCookieFor(value) });
  const pass = await shareEdge.authenticate(viewer, SBX, { allowShare: true });
  assert.equal(pass.via, "share");
  assert.equal(pass.sub, null, "a viewer is nobody");
  // The agent host (and anything else that does not pass allowShare) refuses it.
  await assert.rejects(shareEdge.authenticate(viewer, SBX), { status: 401 });

  // View-only: reading is fine, sending anything is not.
  assert.equal((await shareEdge.authenticate(req({ cookie: shareCookieFor(value) }), SBX, { allowShare: true })).via, "share");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    await assert.rejects(shareEdge.authenticate({ method, headers: { cookie: shareCookieFor(value) } }, SBX, { allowShare: true }), { status: 405 }, method);
  }
  assert.equal((await shareEdge.authenticate({ method: "HEAD", headers: { cookie: shareCookieFor(value) } }, SBX, { allowShare: true })).via, "share");
  // The owner is not limited by it.
  assert.equal((await shareEdge.authenticate({ method: "POST", headers: { authorization: `Bearer ${token(OWNER)}`, cookie: shareCookieFor(value) } }, SBX, { allowShare: true })).via, "bearer");

  // It works more than once: a chat app fetches the link to build its card.
  assert.equal((await fetch(`${shareBase}?t=${encodeURIComponent(value)}`, { redirect: "manual" })).status, 302);
  // An open redirect is still refused.
  const evil = await fetch(`${shareBase}?t=${encodeURIComponent(value)}&next=${encodeURIComponent("//evil.example/x")}`, { redirect: "manual" });
  assert.equal(evil.headers.get("location"), "/");
});

test("share link: expiry, tampering and the wrong sandbox are refused", async () => {
  const { token: value } = await mintVia();
  const [payload, mac] = value.split(".");
  await assert.rejects(shareEdge.authenticate(req({ cookie: shareCookieFor(`${payload}.AAAA`) }), SBX, { allowShare: true }), { status: 401 });

  const later = createSandboxEdgeAuth({ verifyAccessToken, ownerOf, secret: SECRET, allowedOrigins: [], now: () => Date.now() + 2 * 3600_000 });
  await assert.rejects(later.authenticate(req({ cookie: shareCookieFor(value) }), SBX, { allowShare: true }), { status: 401 });
  assert.equal((await fetch(`${shareBase}?t=${encodeURIComponent("not.a.token")}`, { redirect: "manual" })).status, 401);

  // Bound to its sandbox, and a share token is not a session cookie.
  await assert.rejects(shareEdge.authenticate(req({ cookie: `${shareCookieName("sbx-two")}=${value}` }), "sbx-two", { allowShare: true }), { status: 401 });
  await assert.rejects(shareEdge.authenticate(req({ cookie: cookieFor(value) }), SBX), { status: 401 });
  assert.equal((await fetch(`${shareBase}?t=${encodeURIComponent(shareEdge.mintCookie(SBX, OWNER))}`, { redirect: "manual" })).status, 401);
});

test("share link: the owner can turn one off, and it dies everywhere at once", async () => {
  const { token: value, sid } = await mintVia();
  assert.equal((await shareEdge.authenticate(req({ cookie: shareCookieFor(value) }), SBX, { allowShare: true })).via, "share");

  assert.equal((await fetch(`${shareBase}?revoke=not-a-uuid`, { method: "POST", headers: { Authorization: `Bearer ${token(OWNER)}` } })).status, 400);
  assert.equal((await fetch(`${shareBase}?revoke=${sid}`, { method: "POST", headers: { Authorization: `Bearer ${token(OTHER)}` } })).status, 403);
  assert.equal((await fetch(`${shareBase}?revoke=${sid}`, { method: "POST", headers: { Authorization: `Bearer ${token(OWNER)}` } })).status, 204);

  await assert.rejects(shareEdge.authenticate(req({ cookie: shareCookieFor(value) }), SBX, { allowShare: true }), { status: 401 });
  assert.equal((await fetch(`${shareBase}?t=${encodeURIComponent(value)}`, { redirect: "manual" })).status, 401);

  // Without a revoke store the edge says so rather than pretending.
  const noStore = createSandboxEdgeAuth({ verifyAccessToken, ownerOf, secret: SECRET, allowedOrigins: [] });
  const bare = express();
  bare.all(SHARE_PATH, (r, s) => noStore.shareRoute(r, s, SBX));
  const bareServer = bare.listen(0, "127.0.0.1");
  await new Promise((r) => bareServer.once("listening", r));
  const res = await fetch(`http://127.0.0.1:${bareServer.address().port}${SHARE_PATH}?revoke=${crypto.randomUUID()}`, {
    method: "POST", headers: { Authorization: `Bearer ${token(OWNER)}` },
  });
  assert.equal(res.status, 503);
  bareServer.close();
  shareServer.close();
});
