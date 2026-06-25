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

    const response = await k8sCoreV1Api.createNamespacedService({
        namespace: 'default',
        body: serviceManifest
    });

    return response;
}


export const deleteService = async (sandboxId) => {
    const response = await k8sCoreV1Api.deleteNamespacedService({
        namespace: 'default',
        name: `sandbox-service-${sandboxId}`,
    });
    return response;
}   