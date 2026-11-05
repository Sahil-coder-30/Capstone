// Prints the sandbox pod manifest as JSON without creating anything.
// Usage:
//   node scripts/print-pod-manifest.js [sandboxId] [projectId] [ownerId] | kubectl create --dry-run=server -f -
// Without --dry-run it creates a real test pod; delete it with
//   kubectl delete pod sandbox-pod-<sandboxId>

const [sandboxId = "dryrun-sandbox", projectId = "dryrun-project", ownerId = "dryrun-owner"] = process.argv.slice(2);

const { k8sCoreV1Api } = await import("../src/kubernetes/config.js");
k8sCoreV1Api.createNamespacedPod = async ({ body }) => {
  process.stdout.write(JSON.stringify({ apiVersion: "v1", kind: "Pod", ...body }, null, 2));
};
const { createPod } = await import("../src/kubernetes/pod.js");
await createPod(sandboxId, projectId, ownerId);
