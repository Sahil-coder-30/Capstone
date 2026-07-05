import { k8sCoreV1Api } from "./config.js";

export async function createPod(sandboxId, projectId) {
  const podManifest = {
    metadata: {
      name: `sandbox-pod-${sandboxId}`,
      labels: {
        app: "custom-sandbox",
        sandboxId: sandboxId,
      },
    },
    spec: {
      serviceAccountName: "sandbox-agent-sa",
      volumes: [
        {
          name: "workspace-volume",
          emptyDir: {},
        },
      ],
      initContainers: [
        {
          image: "template",
          imagePullPolicy: "IfNotPresent",
          name: "init-container",
          command: ["sh", "-c", "cp -r /workspace/. /seed/"],
          volumeMounts: [
            {
              name: "workspace-volume",
              mountPath: "/seed",
            },
          ],
        },
        {
          image: "sync-agent",
          imagePullPolicy: "IfNotPresent",
          name: "restore-container",
          command: ["node", "sync.js", "--restore-only"],
          env: [
            {
              name: "PROJECT_ID",
              value: projectId,
            },
            {
              name: "AWS_REGION",
              valueFrom: {
                secretKeyRef: {
                  name: "aws-secret",
                  key: "AWS_REGION",
                },
              },
            },
            {
              name: "AWS_ACCESS_KEY_ID",
              valueFrom: {
                secretKeyRef: {
                  name: "aws-secret",
                  key: "AWS_ACCESS_KEY_ID",
                },
              },
            },
            {
              name: "AWS_SECRET_ACCESS_KEY",
              valueFrom: {
                secretKeyRef: {
                  name: "aws-secret",
                  key: "AWS_SECRET_ACCESS_KEY",
                },
              },
            },
            {
              name: "AWS_BUCKET_NAME",
              valueFrom: {
                secretKeyRef: {
                  name: "aws-secret",
                  key: "AWS_BUCKET_NAME",
                },
              },
            },
          ],
          resources: {
            limits: {
              cpu: "500m",
              memory: "512Mi",
            },
            requests: {
              cpu: "250m",
              memory: "256Mi",
            },
          },
          volumeMounts: [
            {
              name: "workspace-volume",
              mountPath: "/workspace",
            },
          ],
        },
      ],
      containers: [
        {
          image: "template",
          imagePullPolicy: "IfNotPresent",
          name: "sandbox-container",
          ports: [{ containerPort: 5173, name: "http" }],
          resources: {
            limits: {
              cpu: "500m",
              memory: "512Mi",
            },
            requests: {
              cpu: "250m",
              memory: "256Mi",
            },
          },
          volumeMounts: [
            {
              name: "workspace-volume",
              mountPath: "/workspace",
            },
          ],
        },
        {
          image: "agent",
          imagePullPolicy: "IfNotPresent",
          name: "agent-container",
          ports: [{ containerPort: 3000, name: "agent-http" }],
          resources: {
            limits: {
              cpu: "500m",
              memory: "512Mi",
            },
            requests: {
              cpu: "250m",
              memory: "500Mi",
            },
          },
          volumeMounts: [
            {
              name: "workspace-volume",
              mountPath: "/workspace",
            },
          ],
        },
        {
          image: "sync-agent",
          imagePullPolicy: "IfNotPresent",
          name: "sync-agent-container",
          env: [
            {
              name: "PROJECT_ID",
              value: projectId,
            },
            {
              name: "AWS_REGION",
              valueFrom: {
                secretKeyRef: {
                  name: "aws-secret",
                  key: "AWS_REGION",
                },
              },
            },
            {
              name: "AWS_ACCESS_KEY_ID",
              valueFrom: {
                secretKeyRef: {
                  name: "aws-secret",
                  key: "AWS_ACCESS_KEY_ID",
                },
              },
            },
            {
              name: "AWS_SECRET_ACCESS_KEY",
              valueFrom: {
                secretKeyRef: {
                  name: "aws-secret",
                  key: "AWS_SECRET_ACCESS_KEY",
                },
              },
            },
            {
              name: "AWS_BUCKET_NAME",
              valueFrom: {
                secretKeyRef: {
                  name: "aws-secret",
                  key: "AWS_BUCKET_NAME",
                },
              },
            },
          ],
          resources: {
            limits: {
              cpu: "300m",
              memory: "256Mi",
            },
            requests: {
              cpu: "100m",
              memory: "128Mi",
            },
          },
          volumeMounts: [
            {
              name: "workspace-volume",
              mountPath: "/workspace",
            },
          ],
        },
      ],
    },
  };

  try {
    const response = await k8sCoreV1Api.createNamespacedPod({
      namespace: "default",
      body: podManifest,
    });
    return response;
  } catch (err) {
    // @kubernetes/client-node v1.x surfaces the HTTP status in err.body.code
    // (the K8s Status object) and also as "HTTP-Code: N" in err.message.
    const httpCode =
      err?.body?.code ??
      Number(String(err?.message ?? '').match(/HTTP-Code:\s*(\d+)/)?.[1]);
    if (httpCode === 409) {
      console.warn(`Pod sandbox-pod-${sandboxId} already exists — skipping create.`);
      return null;
    }
    throw err;
  }
}

export async function deletePod(sandboxId) {
  const response = await k8sCoreV1Api.deleteNamespacedPod({
    namespace: "default",
    name: `sandbox-pod-${sandboxId}`,
  }, {
    gracePeriodSeconds: 0,
  });
  return response;
}

/**
 * Query K8s for the real phase of a sandbox pod.
 * Returns the pod phase string: "Pending" | "Running" | "Succeeded" | "Failed" | "Unknown"
 * Returns null if the pod does not exist (404).
 */
export async function getPodStatus(sandboxId) {
  try {
    const pod = await k8sCoreV1Api.readNamespacedPod({
      namespace: "default",
      name: `sandbox-pod-${sandboxId}`,
    });
    return pod?.status?.phase ?? "Unknown";
  } catch (err) {
    const httpCode =
      err?.body?.code ??
      Number(String(err?.message ?? '').match(/HTTP-Code:\s*(\d+)/)?.[1]);
    if (httpCode === 404) return null; // pod doesn't exist
    throw err;
  }
}