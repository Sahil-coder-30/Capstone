// Offline check of the sandbox pod manifest: owner env for the sidecar auth,
// no Kubernetes token, non-root user containers, shared Vite log file.

import { test } from "node:test";
import assert from "node:assert/strict";

const { k8sCoreV1Api } = await import("../src/kubernetes/config.js");
let manifest = null;
k8sCoreV1Api.createNamespacedPod = async ({ body }) => {
  manifest = body;
  return body;
};
const { createPod } = await import("../src/kubernetes/pod.js");

const container = (name) => manifest.spec.containers.find((c) => c.name === name);
const env = (c) => Object.fromEntries((c.env || []).map((e) => [e.name, e.value]));
const mounts = (c) => c.volumeMounts.map((m) => m.mountPath);

test("the sidecar gets the owner and sandbox id it checks tokens against", async () => {
  await createPod("sbx-1", "project-1", "owner-1");
  const agentEnv = env(container("agent-container"));
  assert.equal(agentEnv.SANDBOX_ID, "sbx-1");
  assert.equal(agentEnv.OWNER_USER_ID, "owner-1");
  assert.ok(agentEnv.AUTH_JWKS_URI);
  assert.ok(agentEnv.CLIENT_URL);
});

test("refuses to create a pod without an owner", async () => {
  await assert.rejects(createPod("sbx-2", "project-2"), /ownerId is required/);
});

test("no Kubernetes credentials and no root in user-facing containers", async () => {
  await createPod("sbx-1", "project-1", "owner-1");
  assert.equal(manifest.spec.automountServiceAccountToken, false);
  assert.equal(manifest.spec.serviceAccountName, undefined);

  for (const name of ["agent-container", "sandbox-container"]) {
    const sc = container(name).securityContext;
    assert.equal(sc.runAsUser, 1000, name);
    assert.equal(sc.runAsNonRoot, true, name);
    assert.equal(sc.allowPrivilegeEscalation, false, name);
    assert.deepEqual(sc.capabilities.drop, ["ALL"], name);
  }

  const inits = manifest.spec.initContainers.map((c) => c.name);
  assert.equal(inits.at(-1), "fix-permissions", "files are chowned after every root init step");
});

test("Vite output goes to a shared log file the agent can read", async () => {
  await createPod("sbx-1", "project-1", "owner-1");
  assert.match(container("sandbox-container").command.join(" "), /tee -a \/sandbox-logs\/vite\.log/);
  assert.ok(mounts(container("sandbox-container")).includes("/sandbox-logs"));
  assert.ok(mounts(container("agent-container")).includes("/sandbox-logs"));
  assert.ok(manifest.spec.volumes.some((v) => v.name === "sandbox-logs"));
});
