import { k8sCoreV1Api } from './config.js';

export const createService = async (sandboxId) => {
    const serviceManifest = {
        metadata: {
            name: `sandbox-service-${sandboxId}`,
            labels: {
                app: "custom-sandbox",
                sandboxId: sandboxId
            }
        },
        spec: {
            selector: {
                app: "custom-sandbox",
                sandboxId: sandboxId
            },
            ports: [
                {
                protocol: 'TCP',
                port: 80,
                targetPort: 5173,
                name: 'http',
                
            },
            {
                protocol: 'TCP',
                port: 3000,
                targetPort: 3000,
                name: 'agent-http'
            }
        ],
            type: 'ClusterIP'
        }
    };

    try {
        const response = await k8sCoreV1Api.createNamespacedService({
            namespace: 'default',
            body: serviceManifest
        });
        return response;
    } catch (err) {
        // @kubernetes/client-node v1.x surfaces the HTTP status in err.body.code
        // (the K8s Status object) and also as "HTTP-Code: N" in err.message.
        const httpCode =
            err?.body?.code ??
            Number(String(err?.message ?? '').match(/HTTP-Code:\s*(\d+)/)?.[1]);
        if (httpCode === 409) {
            console.warn(`Service sandbox-service-${sandboxId} already exists — skipping create.`);
            return null;
        }
        throw err;
    }
}


export const deleteService = async (sandboxId) => {
    const response = await k8sCoreV1Api.deleteNamespacedService({
        namespace: 'default',
        name: `sandbox-service-${sandboxId}`,
    });
    return response;
}   