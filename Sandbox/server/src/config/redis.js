import Redis from 'ioredis'
import { deletePod } from '../kubernetes/pod.js';
import { deleteService } from '../kubernetes/service.js';

const redis = new Redis(process.env.REDIS_URI);

const subscriber = new Redis(process.env.REDIS_URI);


export const createSandboxKey = async (sandboxId) =>{
    await redis.set(`sandbox:${sandboxId}`,JSON.stringify({
        status : "active"
    }) , "EX" , 120);
}

export const deleteSandboxKey = async (sandboxId) => {
    try{
        await redis.del(`sandbox:${sandboxId}`);
        console.log(`redis key deleted : ${sandboxId}`);
    }catch(err){
        console.error(err);
    }
}

subscriber.config("SET" , 'notify-keyspace-events' , 'Ex');

subscriber.subscribe('__keyevent@0__:expired' , (err) => {
    if(err) console.error(err);
})

subscriber.on('message', async (channel , key) => {
    const sandboxId = key.split(':')[1];
    console.log(`sandbox expired : ${sandboxId}`);
    await deletePod(sandboxId);
    console.log(`pod deleted : ${sandboxId}`);
    await deleteService(sandboxId);
    console.log(`service deleted : ${sandboxId}`);
    await redis.del(`sandbox:${sandboxId}`);
    console.log(`redis key deleted : ${sandboxId}`);
})


export default { subscriber };